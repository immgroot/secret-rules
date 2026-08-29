import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PrivatePlayerRoundStateSchema, SecretRuleSchema, type ObservableGameEvent, type PrivatePlayerRoundState,
  type RuleCategory, type RuleParameters, type SessionGrant,
} from "@secret-rules/shared";
import { BUTTON_RULE_PACK, BUTTON_RULE_TEMPLATE_COUNT, BUTTON_RULE_TEMPLATES } from "../src/games/button/catalog.ts";
import { evaluateButtonRule } from "../src/games/button/evaluator.ts";
import { buttonOutcomeForCounter, resolveButtonPress } from "../src/games/button/engine.ts";
import { BUTTON_MODE_CONFIG } from "../src/games/button/modes.ts";
import { appendRuleHistory, generateRuleSet, THE_BUTTON_MINI_GAME } from "../src/rules/engine.ts";
import { mockPlayers } from "../src/rules/simulate.ts";
import { RoomOwner } from "../src/rooms/room-owner.ts";
import { SCORING_CONFIG } from "../src/scoring/config.ts";
import { rankedStandings, scoreRound, winners } from "../src/scoring/engine.ts";

const person = (displayName: string) => ({ requestId: randomUUID(), displayName, avatarId: "lime" as const });
const command = (roomId: string) => ({ requestId: randomUUID(), roomId });
const credential = ({ roomId, playerId, token }: SessionGrant) => ({ roomId, playerId, token });

function rule(templateId: string, ownerId: string, parameters: RuleParameters = {}, targetPlayerId?: string, secondaryTargetPlayerId?: string, category: RuleCategory = "personal") {
  return SecretRuleSchema.parse({
    id: randomUUID(), templateId, identity: `${templateId}:${ownerId}`, miniGameId: "the-button", category,
    rarity: category === "hidden_ability" ? "rare" : "common", difficulty: "easy", parameters,
    ...(targetPlayerId ? { targetPlayerId } : {}), ...(secondaryTargetPlayerId ? { secondaryTargetPlayerId } : {}),
    conflictTags: [], compatibilityTags: [], incompatibilityTags: [], description: `${templateId} objective`, shortDescription: `${templateId} rule`,
    progressType: parameters.actionCount ? "counter" : "binary", rewardWeight: 1, visibility: "private",
    evaluatorId: `rule:${templateId.toLowerCase().replaceAll("_", "-")}`,
  });
}
function state(templateId: string, playerId: string, options: { parameters?: RuleParameters; targetPlayerId?: string; ability?: "DOUBLE" | "BLOCK" | "PROTECT" } = {}): PrivatePlayerRoundState {
  const secretRule = rule(templateId, playerId, options.parameters ?? (options.ability ? { ability: options.ability, uses: 1 } : {}), options.targetPlayerId, undefined, options.ability ? "hidden_ability" : "personal");
  return PrivatePlayerRoundStateSchema.parse({
    roundId: randomUUID(), roundNumber: 1, miniGameId: "the-button", playerId, secretRule,
    privateKnowledge: [], hiddenAbilities: options.ability ? [{ id: randomUUID(), title: "SECRET ABILITY", ability: options.ability, description: secretRule.description, usesRemaining: 1 }] : [],
    privateProgress: { status: "not_started", current: null, target: null, summary: "NOT STARTED" }, privateTargetPlayerId: options.targetPlayerId ?? null, acknowledgedAt: null,
  });
}
function events(records: readonly { actor: string; previous: number; current: number }[], active: readonly string[], ended = false): ObservableGameEvent[] {
  const result: ObservableGameEvent[] = [{ type: "SEQUENCE_CHANGED", playerIds: [...active], at: 1 }];
  records.forEach((record, index) => result.push({ type: "PUBLIC_VALUE_CHANGED", previous: record.previous, current: record.current, actorPlayerId: record.actor, at: index + 2 }));
  if (ended) result.push({ type: "ROUND_EVENT", event: "ROUND_RESOLVED", at: records.length + 2 });
  return result;
}

test("The Button pack has 49 distinct mechanics and produces valid 4–10 player rounds without repeating a player's last family", () => {
  assert.equal(BUTTON_RULE_TEMPLATE_COUNT, 49);
  assert.equal(new Set(BUTTON_RULE_TEMPLATES.map((template) => template.id)).size, 49);
  for (const count of [4, 6, 8, 10]) {
    const players = mockPlayers(count);
    const history = new Map();
    const first = generateRuleSet({ seed: `button-${count}-one`, roundNumber: 1, miniGameId: THE_BUTTON_MINI_GAME.id, players, settings: { chaos: "normal" }, capabilities: THE_BUTTON_MINI_GAME.capabilities, history });
    appendRuleHistory(history, first.historyEntries);
    const second = generateRuleSet({ seed: `button-${count}-two`, roundNumber: 2, miniGameId: THE_BUTTON_MINI_GAME.id, players, settings: { chaos: "normal" }, capabilities: THE_BUTTON_MINI_GAME.capabilities, history });
    assert.equal(first.assignments.size, count);
    assert.equal(second.assignments.size, count);
    for (const [playerId, assigned] of second.assignments) {
      assert.match(assigned.secretRule.templateId, /^BUTTON_/);
      assert.notEqual(assigned.secretRule.templateId, first.assignments.get(playerId)?.secretRule.templateId);
      assert.ok(!assigned.secretRule.targetPlayerId || players.some((player) => player.playerId === assigned.secretRule.targetPlayerId));
    }
  }
});

test("Classic mode is the only playable Button mode and Mayhem stays isolated", () => {
  assert.deepEqual(BUTTON_RULE_PACK.supportedButtonModes, ["CLASSIC"]);
  assert.ok(BUTTON_RULE_TEMPLATES.every((template) => template.supportedButtonModes?.length === 1 && template.supportedButtonModes[0] === "CLASSIC"));
  assert.deepEqual(BUTTON_MODE_CONFIG.CLASSIC, { playable: true, usesActionTokens: false, usesPublicEvents: false });
  assert.deepEqual(BUTTON_MODE_CONFIG.MAYHEM, { playable: false, usesActionTokens: true, usesPublicEvents: true });
  assert.throws(() => generateRuleSet({
    seed: "mayhem-must-not-start", roundNumber: 1, miniGameId: THE_BUTTON_MINI_GAME.id,
    players: mockPlayers(4), settings: { chaos: "normal" }, capabilities: THE_BUTTON_MINI_GAME.capabilities,
    buttonMode: "MAYHEM",
  }), /not playable/);
});

test("authoritative additive scoring applies secret, team, hard, and explicitly eligible wild points", () => {
  const [a, b, c, d] = Array.from({ length: 4 }, randomUUID) as [string, string, string, string];
  const completed = (templateId: string, playerId: string, difficulty: "easy" | "medium" | "hard" = "easy", rarity: "common" | "wild" = "common") => {
    const base = state(templateId, playerId);
    return { ...base, secretRule: { ...base.secretRule, difficulty, rarity }, privateProgress: { ...base.privateProgress, status: "completed" as const, summary: "COMPLETED" } };
  };
  const failed = state("BUTTON_PRESS_EXACTLY", b);
  const teamSuccess = scoreRound({
    roundNumber: 1, assignments: new Map([[a, completed("BUTTON_PRESS_ONCE", a)], [b, failed]]), previousScores: new Map(),
    publicChallengeSucceeded: true, wildBonusEligible: () => false,
  });
  assert.equal(teamSuccess.roundScore.entries.find((entry) => entry.playerId === a)?.roundTotal, 4);
  assert.equal(teamSuccess.roundScore.entries.find((entry) => entry.playerId === b)?.roundTotal, 1);

  const hardSuccess = scoreRound({
    roundNumber: 1, assignments: new Map([[c, completed("BUTTON_PRESS_BEFORE_AND_AFTER", c, "hard")]]), previousScores: new Map(),
    publicChallengeSucceeded: false, wildBonusEligible: () => false,
  });
  assert.equal(hardSuccess.roundScore.entries[0]?.roundTotal, 4);

  const wildSuccess = scoreRound({
    roundNumber: 1, assignments: new Map([[d, completed("BUTTON_FIRST_AND_FINAL", d, "hard", "wild")]]), previousScores: new Map(),
    publicChallengeSucceeded: false, wildBonusEligible: (templateId) => templateId === "BUTTON_FIRST_AND_FINAL",
  });
  assert.deepEqual(SCORING_CONFIG, { secretRuleSuccess: 3, publicChallengeSuccess: 1, difficultyBonus: { easy: 0, medium: 0, hard: 1 }, eligibleWildBonus: 2 });
  assert.deepEqual({ hard: wildSuccess.roundScore.entries[0]?.difficultyBonusPoints, wild: wildSuccess.roundScore.entries[0]?.wildBonusPoints, total: wildSuccess.roundScore.entries[0]?.roundTotal }, { hard: 1, wild: 2, total: 6 });
  const tied = rankedStandings(new Map([[a, 8], [b, 8], [c, 5]]));
  assert.deepEqual(tied.map(({ rank, score }) => ({ rank, score })), [{ rank: 1, score: 8 }, { rank: 1, score: 8 }, { rank: 3, score: 5 }]);
  assert.deepEqual(new Set(winners(tied)), new Set([a, b]));
});

test("Button evaluators keep progress private and handle counters, direct conflicts, and a changing final actor", () => {
  const [a, b, c, d] = Array.from({ length: 4 }, randomUUID) as [string, string, string, string];
  const onePress = events([{ actor: a!, previous: 0, current: 1 }], [a!, b!, c!, d!]);
  const exact = evaluateButtonRule(rule("BUTTON_PRESS_EXACTLY", a!, { actionCount: 3 }), a!, onePress);
  assert.deepEqual({ status: exact.status, current: exact.current, target: exact.target }, { status: "still_possible", current: 1, target: 3 });

  const hitThirteen = events([{ actor: c!, previous: 12, current: 13 }], [a!, b!, c!, d!]);
  assert.equal(evaluateButtonRule(rule("BUTTON_REACH_VALUE", a!, { publicValue: 13 }), a!, hitThirteen).status, "completed");
  assert.equal(evaluateButtonRule(rule("BUTTON_AVOID_VALUE", b!, { publicValue: 13 }), b!, hitThirteen).status, "failed");

  const targetLast = rule("BUTTON_TARGET_LAST", a!, {}, b!);
  assert.equal(evaluateButtonRule(targetLast, a!, events([{ actor: b!, previous: 0, current: 1 }], [a!, b!, c!, d!])).status, "currently_satisfied");
  assert.equal(evaluateButtonRule(targetLast, a!, events([{ actor: b!, previous: 0, current: 1 }, { actor: c!, previous: 1, current: 2 }], [a!, b!, c!, d!])).status, "still_possible");
  assert.equal(evaluateButtonRule(targetLast, a!, events([{ actor: b!, previous: 0, current: 1 }, { actor: c!, previous: 1, current: 2 }], [a!, b!, c!, d!], true)).status, "failed");

  const legalSequence = events([
    { actor: a!, previous: 0, current: 1 },
    { actor: b!, previous: 1, current: 2 },
    { actor: a!, previous: 2, current: 3 },
    { actor: c!, previous: 3, current: 4 },
  ], [a!, b!, c!, d!]);
  assert.equal(evaluateButtonRule(rule("BUTTON_RETURN_AFTER_TARGET", a!, {}, b!), a!, legalSequence).status, "completed");
  assert.equal(evaluateButtonRule(rule("BUTTON_TARGET_BETWEEN_DIFFERENT", d!, {}, a!), d!, legalSequence).status, "completed");
  assert.equal(evaluateButtonRule(rule("BUTTON_THREE_DISTINCT_IN_ROW", d!), d!, legalSequence).status, "completed");
});

test("DOUBLE, BLOCK, and PROTECT resolve server-side while public callers receive only the resulting delta", () => {
  const a = randomUUID(); const b = randomUUID(); const c = randomUUID();
  const doubled = resolveButtonPress(new Map([[a, state("BUTTON_DOUBLE", a, { ability: "DOUBLE" })], [b, state("BUTTON_NEVER_PRESS", b)]]), a);
  assert.equal(doubled.delta, 2);
  assert.deepEqual(doubled.modifiers, ["DOUBLE"]);
  assert.equal(doubled.assignments.get(a)?.hiddenAbilities[0]?.usesRemaining, 0);
  assert.equal(doubled.assignments.get(b)?.hiddenAbilities.length, 0);

  const blocked = resolveButtonPress(new Map([[a, state("BUTTON_PRESS_ONCE", a)], [b, state("BUTTON_BLOCK", b, { ability: "BLOCK", targetPlayerId: a })]]), a);
  assert.equal(blocked.delta, 0);
  assert.equal(blocked.assignments.get(b)?.hiddenAbilities[0]?.usesRemaining, 0);

  const protectedPress = resolveButtonPress(new Map([
    [a, state("BUTTON_PROTECT", a, { ability: "PROTECT" })],
    [b, state("BUTTON_BLOCK", b, { ability: "BLOCK", targetPlayerId: a })],
    [c, state("BUTTON_NEVER_PRESS", c)],
  ]), a);
  assert.equal(protectedPress.delta, 1);
  assert.deepEqual(new Set(protectedPress.modifiers), new Set(["PROTECT", "BLOCK"]));
  assert.equal(buttonOutcomeForCounter(19), "pending");
  assert.equal(buttonOutcomeForCounter(20), "success");
  assert.equal(buttonOutcomeForCounter(21), "overshoot");
});

test("RoomOwner runs start, deal, acknowledgement, countdown, synchronized Button play, reconnect, reveal, and next round", () => {
  let now = 1_000;
  const privateBySocket = new Map<string, PrivatePlayerRoundState | null>();
  const broadcasts: { counter: number; recipients: readonly string[] }[] = [];
  const owner = new RoomOwner({
    now: () => now, buttonCountdownMs: 1, buttonResolutionMs: 1, buttonRechargeMs: 0,
    publish: (snapshot, recipients) => broadcasts.push({ counter: snapshot.publicRound?.publicGameState.counter ?? -1, recipients }),
    publishPrivate: (privateState, socketId) => privateBySocket.set(socketId, privateState),
  });
  const host = owner.create("a", person("Aster"));
  const joins = ["b", "c", "d", "e"].map((socket, index) => owner.join(socket, { ...person(["Birch", "Cedar", "Dune", "Elm"][index]!), roomCode: host.state.roomCode }));
  const spectator = owner.join("watch", { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" });
  const roomId = host.state.roomId;
  owner.kick("a", { ...command(roomId), targetPlayerId: joins[3]!.session.playerId });
  assert.throws(() => owner.pressButton("e", command(roomId)), { message: "INVALID_SESSION" });
  for (const socket of ["a", "b", "c", "d"]) owner.setReady(socket, { ...command(roomId), ready: true });
  const started = owner.startGame("a", command(roomId));
  assert.equal(started.state.status, "in_game");
  assert.equal(started.state.publicRound?.phase, "waiting_for_rule_ack");
  assert.equal(privateBySocket.has("watch"), false);
  assert.throws(() => owner.pressButton("watch", command(roomId)), { message: "PLAYER_ONLY" });
  assert.throws(() => owner.pressButton("stranger", command(roomId)), { message: "INVALID_SESSION" });
  for (const socket of ["a", "b", "c", "d"]) owner.acknowledgeRule(socket, command(roomId));
  assert.equal(owner.requestState("a", roomId).state.publicRound?.phase, "countdown");
  now += 1; owner.sweep();
  assert.equal(owner.requestState("a", roomId).state.publicRound?.phase, "playing");

  const assignments = [...privateBySocket.entries()].filter((entry): entry is [string, PrivatePlayerRoundState] => entry[1] !== null && entry[0] !== "watch");
  const blockedTargets = new Set(assignments.filter(([, assigned]) => assigned.secretRule.templateId === "BUTTON_BLOCK").map(([, assigned]) => assigned.secretRule.targetPlayerId));
  const safeActors = assignments.filter(([, assigned]) => assigned.secretRule.templateId !== "BUTTON_DOUBLE" && !blockedTargets.has(assigned.playerId));
  assert.ok(safeActors.length >= 2);
  const safe = safeActors[0]!;
  const alternate = safeActors[1]!;
  const safeSession = safe[0] === "a" ? host : joins[["b", "c", "d"].indexOf(safe[0])]!;
  const firstRequest = command(roomId);
  const first = owner.pressButton(safe[0], firstRequest);
  assert.equal(first.state.publicRound?.publicGameState.counter, 1);
  assert.equal(owner.pressButton(safe[0], firstRequest).state.publicRound?.publicGameState.counter, 1, "duplicate request must not press twice");
  owner.disconnect(safe[0]);
  const restoredSocket = `${safe[0]}-restored`;
  const beforeReconnect = privateBySocket.get(safe[0])!;
  const resumed = owner.resume(restoredSocket, credential(safeSession.session));
  assert.equal(privateBySocket.get(restoredSocket)?.secretRule.id, beforeReconnect?.secretRule.id);
  assert.equal(privateBySocket.get(restoredSocket)?.privateProgress.summary, beforeReconnect?.privateProgress.summary);
  for (let counter = 1; counter < 20; counter++) {
    const actorSocket = counter % 2 === 1 ? alternate[0] : restoredSocket;
    const snapshot = owner.pressButton(actorSocket, command(roomId)).state;
    assert.equal(snapshot.publicRound?.publicGameState.counter, counter + 1);
  }
  const resolving = owner.requestState(restoredSocket, roomId).state;
  assert.equal(resolving.publicRound?.phase, "resolving");
  assert.equal(resolving.publicRound?.publicGameState.outcome, "success");
  assert.throws(() => owner.pressButton(restoredSocket, command(roomId)), { message: "INVALID_GAME_PHASE" });
  assert.ok(broadcasts.at(-1)?.recipients.includes("watch"));
  assert.equal(JSON.stringify(resolving).includes("serverOnlyModifiers"), false);
  now += 1; owner.sweep();
  const reveal = owner.requestState(restoredSocket, roomId).state.publicRound;
  assert.equal(reveal?.phase, "reveal");
  assert.equal(reveal?.reveal?.entries.length, 4);
  assert.equal(owner.requestState("watch", roomId).state.publicRound?.reveal?.entries.length, 4);
  const hostSocket = safeSession.session.playerId === host.session.playerId ? restoredSocket : "a";
  const next = owner.continueRound(hostSocket, command(roomId));
  assert.equal(next.state.publicRound?.roundNumber, 2);
  assert.equal(next.state.publicRound?.publicGameState.counter, 0);
  assert.equal(next.state.players.find((player) => player.playerId === safeSession.session.playerId)?.playerColor, resumed.state.players.find((player) => player.playerId === safeSession.session.playerId)?.playerColor);
  assert.equal(spectator.session.playerId, next.state.players.find((player) => player.role === "spectator")?.playerId);
});

test("global recharge and the previous-actor lock pace every normal Button action", () => {
  let now = 25_000;
  const privateBySocket = new Map<string, PrivatePlayerRoundState | null>();
  const owner = new RoomOwner({
    now: () => now, buttonCountdownMs: 1, buttonRechargeMs: 850,
    publishPrivate: (state, socketId) => privateBySocket.set(socketId, state),
  });
  const host = owner.create("a", person("Aster"));
  for (const [socket, name] of [["b", "Birch"], ["c", "Cedar"], ["d", "Dune"]] as const) owner.join(socket, { ...person(name), roomCode: host.state.roomCode });
  for (const socket of ["a", "b", "c", "d"]) owner.setReady(socket, { ...command(host.state.roomId), ready: true });
  owner.startGame("a", command(host.state.roomId));
  for (const socket of ["a", "b", "c", "d"]) owner.acknowledgeRule(socket, command(host.state.roomId));
  now += 1; owner.sweep();

  const assignments = [...privateBySocket.entries()].filter((entry): entry is [string, PrivatePlayerRoundState] => entry[1] !== null);
  const blockedTargets = new Set(assignments.filter(([, state]) => state.secretRule.templateId === "BUTTON_BLOCK").map(([, state]) => state.secretRule.targetPlayerId));
  const normal = assignments.filter(([, state]) => state.secretRule.templateId !== "BUTTON_DOUBLE" && !blockedTargets.has(state.playerId));
  assert.ok(normal.length >= 2);
  const [firstActor, secondActor] = normal;

  const first = owner.pressButton(firstActor![0], command(host.state.roomId)).state.publicRound!;
  assert.equal(first.publicGameState.counter, 1);
  assert.equal(first.publicGameState.lastNormalActorPlayerId, firstActor![1].playerId);
  assert.equal(first.publicGameState.rechargeEndsAt, now + 850);
  assert.throws(() => owner.pressButton(firstActor![0], command(host.state.roomId)), { message: "BUTTON_REPEAT_LOCKED" });
  assert.throws(() => owner.pressButton(secondActor![0], command(host.state.roomId)), { message: "BUTTON_RECHARGING" });

  now += 850;
  const second = owner.pressButton(secondActor![0], command(host.state.roomId)).state.publicRound!;
  assert.equal(second.publicGameState.counter, 2);
  assert.equal(second.publicGameState.lastNormalActorPlayerId, secondActor![1].playerId);
  now += 850;
  assert.equal(owner.pressButton(firstActor![0], command(host.state.roomId)).state.publicRound?.publicGameState.counter, 3);
});

test("the server clock resolves a Button timeout and freezes the counter before reveal", () => {
  let now = 10_000;
  const owner = new RoomOwner({ now: () => now, buttonCountdownMs: 1, buttonDurationMs: 25, buttonResolutionMs: 1 });
  const host = owner.create("host", person("Host"));
  for (const [socket, name] of [["b", "Birch"], ["c", "Cedar"], ["d", "Dune"]] as const) owner.join(socket, { ...person(name), roomCode: host.state.roomCode });
  for (const socket of ["host", "b", "c", "d"]) owner.setReady(socket, { ...command(host.state.roomId), ready: true });
  owner.startGame("host", command(host.state.roomId));
  for (const socket of ["host", "b", "c", "d"]) owner.acknowledgeRule(socket, command(host.state.roomId));
  now += 1; owner.sweep();
  const playing = owner.requestState("host", host.state.roomId).state;
  assert.equal(playing.publicRound?.phase, "playing");
  assert.equal(playing.publicRound?.publicTimer?.durationMs, 25);
  now += 25; owner.sweep();
  const timedOut = owner.requestState("host", host.state.roomId).state.publicRound;
  assert.equal(timedOut?.phase, "resolving");
  assert.equal(timedOut?.publicGameState.outcome, "timeout");
  assert.equal(timedOut?.publicGameState.counter, 0);
  assert.throws(() => owner.pressButton("host", command(host.state.roomId)), { message: "INVALID_GAME_PHASE" });
  now += 1; owner.sweep();
  assert.equal(owner.requestState("host", host.state.roomId).state.publicRound?.phase, "reveal");
});

test("lobby-selected Button timers are authoritative, host-only, locked in-game, and reused every round", () => {
  const startAt = 100_000;
  for (const seconds of [60, 80, 120, 180, 45]) {
    let now = startAt;
    const owner = new RoomOwner({ now: () => now, buttonCountdownMs: 1, buttonResolutionMs: 1 });
    const host = owner.create("host", person("Host"));
    for (const [socket, name] of [["b", "Birch"], ["c", "Cedar"], ["d", "Dune"]] as const) owner.join(socket, { ...person(name), roomCode: host.state.roomCode });
    const roomId = host.state.roomId;
    const settings = { maxPlayers: 10, roundCount: 3 as const, chaos: "normal" as const, buttonRoundDurationSeconds: seconds };
    if (seconds === 60) assert.throws(() => owner.updateSettings("b", { ...command(roomId), settings }), { message: "NOT_HOST" });
    assert.equal(owner.updateSettings("host", { ...command(roomId), settings }).state.settings.buttonRoundDurationSeconds, seconds);
    for (const socket of ["host", "b", "c", "d"]) owner.setReady(socket, { ...command(roomId), ready: true });
    owner.startGame("host", command(roomId));
    assert.throws(() => owner.updateSettings("host", { ...command(roomId), settings: { ...settings, buttonRoundDurationSeconds: 80 } }), { message: "GAME_ALREADY_STARTED" });
    for (const socket of ["host", "b", "c", "d"]) owner.acknowledgeRule(socket, command(roomId));
    now += 1; owner.sweep();
    const timer = owner.requestState("host", roomId).state.publicRound?.publicTimer;
    assert.equal(timer?.durationMs, seconds * 1000);
    assert.equal(timer?.deadlineAt, now + seconds * 1000);

    if (seconds === 45) {
      now += seconds * 1000; owner.sweep();
      now += 1; owner.sweep();
      owner.continueRound("host", command(roomId));
      for (const socket of ["host", "b", "c", "d"]) owner.acknowledgeRule(socket, command(roomId));
      now += 1; owner.sweep();
      assert.equal(owner.requestState("host", roomId).state.publicRound?.publicTimer?.durationMs, 45_000);
    }
  }
});

test("three rounds publish scores only at reveal, transfer next-round authority, complete automatically, and reset safely", () => {
  let now = 50_000;
  const privateBySocket = new Map<string, PrivatePlayerRoundState | null>();
  const owner = new RoomOwner({
    now: () => now, buttonCountdownMs: 1, buttonDurationMs: 1, buttonResolutionMs: 1,
    publishPrivate: (state, socketId) => privateBySocket.set(socketId, state),
  });
  const host = owner.create("a", person("Aster"));
  const joins = [
    owner.join("b", { ...person("Birch"), roomCode: host.state.roomCode }),
    owner.join("c", { ...person("Cedar"), roomCode: host.state.roomCode }),
    owner.join("d", { ...person("Dune"), roomCode: host.state.roomCode }),
  ];
  const roomId = host.state.roomId;
  owner.updateSettings("a", { ...command(roomId), settings: { maxPlayers: 10, roundCount: 3, chaos: "normal", buttonRoundDurationSeconds: 80 } });
  for (const socket of ["a", "b", "c", "d"]) owner.setReady(socket, { ...command(roomId), ready: true });
  owner.startGame("a", command(roomId));

  const finishRound = (expected: "reveal" | "match_complete") => {
    for (const socket of ["a", "b", "c", "d"]) owner.acknowledgeRule(socket, command(roomId));
    now += 1; owner.sweep();
    const playing = owner.requestState("a", roomId).state.publicRound!;
    assert.equal(playing.phase, "playing");
    assert.equal(playing.roundScore, null);
    const priorScores = playing.scores.map((standing) => standing.score);
    now += 1; owner.sweep();
    const resolving = owner.requestState("a", roomId).state.publicRound!;
    assert.equal(resolving.phase, "resolving");
    assert.equal(resolving.roundScore, null, "private results must not affect public score during resolution");
    assert.deepEqual(resolving.scores.map((standing) => standing.score), priorScores);
    now += 1; owner.sweep();
    const finished = owner.requestState("a", roomId).state.publicRound!;
    assert.equal(finished.phase, expected);
    assert.ok(finished.roundScore);
    assert.equal(finished.roundScore.entries.length, 4);
    return finished;
  };

  const first = finishRound("reveal");
  assert.equal(first.roundNumber, 1);
  assert.equal(first.buttonMode, "CLASSIC");
  assert.throws(() => owner.continueRound("b", command(roomId)), { message: "NOT_HOST" });
  owner.transferHost("a", { ...command(roomId), targetPlayerId: joins[0]!.session.playerId });
  assert.throws(() => owner.continueRound("a", command(roomId)), { message: "NOT_HOST" });
  assert.equal(owner.continueRound("b", command(roomId)).state.publicRound?.roundNumber, 2);

  finishRound("reveal");
  assert.throws(() => owner.continueRound("a", command(roomId)), { message: "NOT_HOST" });
  assert.equal(owner.continueRound("b", command(roomId)).state.publicRound?.roundNumber, 3);

  const final = finishRound("match_complete");
  assert.equal(final.matchResult?.completedRounds, 3);
  assert.equal(final.matchResult?.totalRounds, 3);
  assert.ok((final.matchResult?.winnerPlayerIds.length ?? 0) >= 1);
  assert.equal(final.matchResult?.finalStandings[0]?.score, Math.max(...final.scores.map((standing) => standing.score)));
  assert.throws(() => owner.continueRound("b", command(roomId)), { message: "INVALID_GAME_PHASE" });
  assert.throws(() => owner.returnToLobby("a", command(roomId)), { message: "NOT_HOST" });

  const lobby = owner.returnToLobby("b", command(roomId)).state;
  assert.equal(lobby.status, "lobby");
  assert.equal(lobby.publicRound, null);
  assert.equal(lobby.hostPlayerId, joins[0]!.session.playerId);
  assert.equal(lobby.settings.roundCount, 3);
  assert.ok(lobby.players.every((player) => !player.ready));
  assert.ok(["a", "b", "c", "d"].every((socket) => privateBySocket.get(socket) === null));

  for (const socket of ["a", "b", "c", "d"]) owner.setReady(socket, { ...command(roomId), ready: true });
  const restarted = owner.startGame("b", command(roomId)).state.publicRound!;
  assert.equal(restarted.roundNumber, 1);
  assert.equal(restarted.publicGameState.counter, 0);
  assert.ok(restarted.scores.every((standing) => standing.score === 0));
  assert.equal(restarted.roundScore, null);
  assert.equal(restarted.matchResult, null);
});
