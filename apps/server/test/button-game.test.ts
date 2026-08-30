import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BUTTON_CARD_KINDS, DEFAULT_ROOM_SETTINGS, PrivatePlayerRoundStateSchema, SecretRuleSchema,
  type ButtonCardKind, type ObservableGameEvent, type PrivatePlayerRoundState, type RuleParameters, type SessionGrant,
} from "@secret-rules/shared";
import { BUTTON_RULE_PACK, BUTTON_RULE_TEMPLATE_COUNT, BUTTON_RULE_TEMPLATES } from "../src/games/button/catalog.ts";
import { buildButtonDeck, scaledButtonDeckCounts, STANDARD_BUTTON_DECK_COUNTS } from "../src/games/button/deck.ts";
import { evaluateButtonRule } from "../src/games/button/evaluator.ts";
import { applyButtonMovement, basicButtonAvailable, movementForCard } from "../src/games/button/engine.ts";
import { BUTTON_MODE_CONFIG } from "../src/games/button/modes.ts";
import { appendRuleHistory, generateRuleSet, THE_BUTTON_MINI_GAME } from "../src/rules/engine.ts";
import { seededRandom } from "../src/rules/rng.ts";
import { mockPlayers } from "../src/rules/simulate.ts";
import { RoomOwner } from "../src/rooms/room-owner.ts";
import { SCORING_CONFIG } from "../src/scoring/config.ts";
import { applyScoreDelta, createRoundLedger, rankedStandings, scoreButtonV2Round, winners } from "../src/scoring/engine.ts";

const names = ["Aster", "Birch", "Cedar", "Dune", "Elm", "Flint", "Grove", "Harbor", "Indigo", "Juniper"] as const;
const person = (displayName: string) => ({ requestId: randomUUID(), displayName, avatarId: "lime" as const });
const command = (roomId: string) => ({ requestId: randomUUID(), roomId });
const credential = ({ roomId, playerId, token }: SessionGrant) => ({ roomId, playerId, token });

function v2Rule(templateId: string, ownerId: string, parameters: RuleParameters, difficulty: "medium" | "hard" = "medium") {
  return SecretRuleSchema.parse({
    id: randomUUID(), templateId, identity: `${templateId}:${ownerId}`, miniGameId: "the-button-v2", category: "personal",
    rarity: difficulty === "hard" ? "rare" : "common", difficulty, parameters,
    conflictTags: [], compatibilityTags: [], incompatibilityTags: [], description: `${templateId} objective`, shortDescription: `${templateId} rule`,
    progressType: "counter", rewardWeight: difficulty === "hard" ? 5 / 3 : 1, visibility: "private",
    evaluatorId: `rule:${templateId.toLowerCase().replaceAll("_", "-")}`,
  });
}

function privateState(playerId: string, difficulty: "medium" | "hard", status: "completed" | "failed"): PrivatePlayerRoundState {
  return PrivatePlayerRoundStateSchema.parse({
    roundId: randomUUID(), roundNumber: 1, miniGameId: "the-button-v2", playerId, revision: 1, hand: [],
    secretRule: v2Rule(difficulty === "hard" ? "BUTTON_V2_BLUFF_UNCAUGHT" : "BUTTON_V2_BLUFF_SUCCESS", playerId, { actionCount: 1 }, difficulty),
    privateProgress: { status, current: status === "completed" ? 1 : 0, target: 1, summary: status.toUpperCase() },
    privateTargetPlayerId: null, acknowledgedAt: null, inspections: [], pendingChoice: null,
  });
}

type RoundHarness = ReturnType<typeof createRound>;
function createRound(options: { players?: number; seed?: string; target?: number; rounds?: 3 | 5 | 7 | 10; graceMs?: number } = {}) {
  let now = 1_000;
  const count = options.players ?? 4;
  const privateBySocket = new Map<string, PrivatePlayerRoundState | null>();
  const owner = new RoomOwner({
    now: () => now, buttonCountdownMs: 1, challengeTimerMs: 10, challengeRevealMs: 1, turnTimerMs: 1_000,
    ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
    roundSeed: () => options.seed ?? "button-v2-test-seed",
    publishPrivate: (state, socketId) => privateBySocket.set(socketId, state),
  });
  const sessions: SessionGrant[] = [];
  const sockets: string[] = [];
  const host = owner.create("p0", person(names[0]));
  sessions.push(host.session); sockets.push("p0");
  for (let index = 1; index < count; index++) {
    const socket = `p${index}`;
    const joined = owner.join(socket, { ...person(names[index]!), roomCode: host.state.roomCode });
    sessions.push(joined.session); sockets.push(socket);
  }
  const spectator = owner.join("spectator", { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" });
  const roomId = host.state.roomId;
  owner.updateSettings("p0", { ...command(roomId), settings: { ...DEFAULT_ROOM_SETTINGS, roundCount: options.rounds ?? 3, buttonTarget: options.target ?? 200 } });
  for (const socket of sockets) owner.setReady(socket, { ...command(roomId), ready: true });
  owner.startGame("p0", command(roomId));
  for (const socket of sockets) owner.acknowledgeRule(socket, command(roomId));
  now += 1; owner.sweep();
  const socketFor = (playerId: string) => sockets[sessions.findIndex((session) => session.playerId === playerId)]!;
  const state = (socket = "p0") => owner.requestState(socket, roomId).state;
  const current = () => {
    const playerId = state().publicRound!.publicGameState.currentPlayerId!;
    const socket = socketFor(playerId);
    return { playerId, socket, privateState: privateBySocket.get(socket)! };
  };
  return {
    owner, roomId, host, sessions, sockets, spectator, privateBySocket, state, current, socketFor,
    advance(ms: number) { now += ms; owner.sweep(); },
  };
}

function findSeedFor(kind: ButtonCardKind, secondKind?: ButtonCardKind) {
  for (let index = 0; index < 20_000; index++) {
    const seed = `effect-${kind}-${secondKind ?? "none"}-${index}`;
    const deck = buildButtonDeck(50, seed);
    const start = seededRandom(`${seed}:round`).integer(0, 3);
    const first = deck.slice(start * 5, start * 5 + 5);
    const second = deck.slice(((start + 1) % 4) * 5, ((start + 1) % 4) * 5 + 5);
    if (first.some((card) => card.kind === kind) && (!secondKind || second.some((card) => card.kind === secondKind))) return seed;
  }
  throw new Error(`No deterministic seed found for ${kind}/${secondKind ?? "none"}.`);
}

function playTrusted(harness: RoundHarness, kind?: ButtonCardKind, targetId?: string) {
  const actor = harness.current();
  const card = kind ? actor.privateState.hand.find((candidate) => candidate.kind === kind)! : actor.privateState.hand[0]!;
  const target = targetId ?? harness.sessions.find((session) => session.playerId !== actor.playerId)!.playerId;
  harness.owner.playCard(actor.socket, { ...command(harness.roomId), cardId: card.cardId, claim: card.kind, ...(["SKIP", "STEAL", "INSPECT"].includes(card.kind) ? { targetPlayerId: target } : {}) });
  harness.advance(10);
  return { actor, card, target };
}

function driveToTarget(harness: RoundHarness) {
  for (let turn = 0; turn < 80 && harness.state().publicRound?.phase !== "target_vote"; turn++) {
    const snapshot = harness.state().publicRound!;
    assert.equal(snapshot.phase, "turn_action");
    const actor = harness.current();
    const remaining = snapshot.publicGameState.target - snapshot.publicGameState.counter;
    const movement = (kind: ButtonCardKind) => movementForCard(kind);
    const card = actor.privateState.hand.find((candidate) => {
      const value = movement(candidate.kind);
      return value !== null && value > 0 && value <= remaining;
    }) ?? actor.privateState.hand.find((candidate) => candidate.kind === "WILD") ?? actor.privateState.hand[0]!;
    const target = harness.sessions.find((session) => session.playerId !== actor.playerId)!.playerId;
    harness.owner.playCard(actor.socket, { ...command(harness.roomId), cardId: card.cardId, claim: card.kind, ...(["SKIP", "STEAL", "INSPECT"].includes(card.kind) ? { targetPlayerId: target } : {}) });
    harness.advance(10);
    if (harness.state().publicRound?.phase === "effect_choice") harness.owner.chooseWild(actor.socket, { ...command(harness.roomId), movement: remaining >= 2 ? 2 : 1 });
  }
  assert.equal(harness.state().publicRound?.phase, "target_vote", "the exact target must remain reachable through normal server resolution");
}

function reconnectAtPhase(
  harness: RoundHarness,
  socket: string,
  restoredSocket: string,
  phase: NonNullable<ReturnType<RoundHarness["state"]>["publicRound"]>["phase"],
  pendingChoice?: "penalty_discard" | "wild_value" | "target_vote",
) {
  const session = harness.sessions[harness.sockets.indexOf(socket)]!;
  const before = harness.privateBySocket.get(socket)!;
  harness.owner.disconnect(socket);
  const resumed = harness.owner.resume(restoredSocket, credential(session));
  const restored = harness.privateBySocket.get(restoredSocket)!;
  assert.equal(resumed.state.publicRound?.phase, phase);
  assert.equal(restored.playerId, session.playerId);
  assert.equal(restored.secretRule.id, before.secretRule.id);
  assert.ok(restored.revision >= before.revision);
  if (pendingChoice) assert.equal(restored.pendingChoice?.kind, pendingChoice);
  return restored;
}

test("the base 50-card deck has the locked composition and scales deterministically", () => {
  assert.deepEqual(STANDARD_BUTTON_DECK_COUNTS, { PLUS_ONE: 11, PLUS_TWO: 9, PLUS_THREE: 5, MINUS_ONE: 7, MINUS_TWO: 4, SKIP: 3, STEAL: 2, INSPECT: 2, REVERSE: 3, SHIELD: 2, WILD: 2 });
  assert.equal(Object.values(STANDARD_BUTTON_DECK_COUNTS).reduce((sum, count) => sum + count, 0), 50);
  for (const size of [30, 40, 50, 80, 100, 130, 160, 200]) assert.equal(Object.values(scaledButtonDeckCounts(size)).reduce((sum, count) => sum + count, 0), size);
  assert.deepEqual(buildButtonDeck(100, "same-seed"), buildButtonDeck(100, "same-seed"));
  assert.notDeepEqual(buildButtonDeck(100, "same-seed"), buildButtonDeck(100, "other-seed"));
  assert.equal(new Set(buildButtonDeck(200, "unique").map((card) => card.cardId)).size, 200);
});

test("movement enforces floor, overshoot, exact target lock, effect +1, Wild-only value, and Basic safety", () => {
  assert.deepEqual(applyButtonMovement(1, 30, -2, false), { previous: 1, attempted: -1, current: 0, applied: -1, overshot: false, secured: false });
  assert.deepEqual(applyButtonMovement(29, 30, 3, false), { previous: 29, attempted: 32, current: 29, applied: 0, overshot: true, secured: false });
  assert.equal(applyButtonMovement(29, 30, 1, false).secured, true);
  assert.equal(applyButtonMovement(30, 30, -2, true).current, 30);
  for (const kind of ["SKIP", "STEAL", "INSPECT", "REVERSE", "SHIELD"] as const) assert.equal(movementForCard(kind), 1);
  assert.equal(movementForCard("WILD"), null);
  assert.equal(basicButtonAvailable(0), true);
  assert.equal(basicButtonAvailable(1), false);
});

test("V2 Secrets use one pack, stay feasible for 4–10 players, and avoid immediate repeats", () => {
  assert.equal(BUTTON_RULE_TEMPLATE_COUNT, 22);
  assert.deepEqual(BUTTON_RULE_PACK.supportedButtonModes, ["V2"]);
  assert.deepEqual(BUTTON_MODE_CONFIG, { V2: { playable: true } });
  assert.equal(new Set(BUTTON_RULE_TEMPLATES.map((template) => template.id)).size, BUTTON_RULE_TEMPLATE_COUNT);
  for (const count of [4, 6, 8, 10]) {
    const players = mockPlayers(count);
    const history = new Map();
    const input = { miniGameId: THE_BUTTON_MINI_GAME.id, players, settings: { ...DEFAULT_ROOM_SETTINGS }, capabilities: THE_BUTTON_MINI_GAME.capabilities, history, buttonMode: "V2" as const, buttonV2Balance: { deckSize: count * 10, target: 30, expectedTurnsPerPlayer: 5, cardCounts: scaledButtonDeckCounts(count * 10) } };
    const first = generateRuleSet({ ...input, seed: `rules-${count}-a`, roundNumber: 1 });
    appendRuleHistory(history, first.historyEntries);
    const second = generateRuleSet({ ...input, seed: `rules-${count}-b`, roundNumber: 2 });
    assert.equal(first.assignments.size, count);
    assert.equal(second.assignments.size, count);
    for (const [playerId, assigned] of second.assignments) {
      assert.match(assigned.secretRule.templateId, /^BUTTON_V2_/);
      assert.notEqual(assigned.secretRule.templateId, first.assignments.get(playerId)?.secretRule.templateId);
      assert.ok((assigned.secretRule.parameters.actionCount ?? 0) <= 6);
    }
  }
});

test("structured V2 outcomes evaluate standard and hard Secrets without client input", () => {
  const owner = randomUUID();
  const opponent = randomUUID();
  const events: ObservableGameEvent[] = [
    { type: "BUTTON_V2_OUTCOME", actorPlayerId: owner, opponentPlayerId: opponent, outcome: "BLUFF_SUCCEEDED", actualCard: "MINUS_TWO", claimedCard: "PLUS_TWO", targeted: false, at: 1 },
    { type: "BUTTON_V2_OUTCOME", actorPlayerId: owner, opponentPlayerId: opponent, outcome: "BLUFF_SUCCEEDED", actualCard: "MINUS_ONE", claimedCard: "PLUS_THREE", targeted: false, at: 2 },
  ];
  const standard = evaluateButtonRule(v2Rule("BUTTON_V2_BLUFF_SUCCESS", owner, { actionCount: 2 }), owner, events);
  const hard = evaluateButtonRule(v2Rule("BUTTON_V2_NEGATIVE_BLUFFS", owner, { actionCount: 2 }, "hard"), owner, [...events, { type: "ROUND_EVENT", event: "ROUND_RESOLVED", at: 3 }]);
  assert.equal(standard.status, "completed");
  assert.equal(hard.status, "completed");
  const impossible = evaluateButtonRule(v2Rule("BUTTON_V2_BLUFF_UNCAUGHT", owner, { actionCount: 2 }, "hard"), owner, [...events, { type: "BUTTON_V2_OUTCOME", actorPlayerId: owner, opponentPlayerId: opponent, outcome: "BLUFF_CAUGHT", actualCard: "PLUS_ONE", claimedCard: "PLUS_TWO", targeted: false, at: 3 }]);
  assert.equal(impossible.status, "failed");
});

test("challenge and Secret scoring is server-owned, floor-safe, additive, and tie-aware", () => {
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  const scores = new Map([[a, 0], [b, 1], [c, 5]]);
  assert.equal(applyScoreDelta(scores, a, -1), 0);
  assert.equal(applyScoreDelta(scores, b, -1), 0);
  const assignments = new Map([[a, privateState(a, "medium", "completed")], [b, privateState(b, "hard", "completed")], [c, privateState(c, "hard", "failed")]]);
  const ledger = createRoundLedger([a, b, c]);
  ledger.get(a)!.challengePoints = 1; ledger.get(a)!.targetPoints = 2;
  ledger.get(b)!.challengePenalties = 1; ledger.get(b)!.targetPoints = 1;
  const result = scoreButtonV2Round({ roundNumber: 1, assignments, liveScores: scores, ledgers: ledger, publicChallengeSucceeded: true });
  assert.deepEqual(SCORING_CONFIG, { challengeWin: 1, challengeLoss: 1, standardSecret: 3, hardSecret: 5, targetLanding: 2, targetOther: 1 });
  assert.equal(result.roundScore.entries.find((entry) => entry.playerId === a)?.secretPoints, 3);
  assert.equal(result.roundScore.entries.find((entry) => entry.playerId === b)?.secretPoints, 5);
  assert.equal(result.roundScore.entries.find((entry) => entry.playerId === c)?.secretPoints, 0);
  const tied = rankedStandings(new Map([[a, 8], [b, 8], [c, 4]]));
  assert.deepEqual(tied.map(({ rank }) => rank), [1, 1, 3]);
  assert.deepEqual(new Set(winners(tied)), new Set([a, b]));
});

test("4-player and 10-player rounds deal five private cards with no host or spectator cross-recipient access", () => {
  for (const count of [4, 10]) {
    const game = createRound({ players: count });
    for (const socket of game.sockets) {
      const privateRound = game.privateBySocket.get(socket);
      assert.equal(privateRound?.hand.length, 5);
      assert.equal(privateRound?.playerId, game.sessions[game.sockets.indexOf(socket)]?.playerId);
      assert.equal(privateRound?.revision && privateRound.revision > 0, true);
      assert.equal(privateRound?.privateProgress.status, "in_progress", "completion projection must stay hidden");
    }
    assert.equal(game.privateBySocket.has("spectator"), false);
    const publicWire = JSON.stringify(game.state());
    for (const privateRound of game.privateBySocket.values()) for (const card of privateRound?.hand ?? []) assert.equal(publicWire.includes(card.cardId), false);
  }
});

test("claims may differ from the real card, name an unowned card, and keep the actual card private when trusted", () => {
  const game = createRound();
  const actor = game.current();
  const card = actor.privateState.hand.find((candidate) => !["SKIP", "STEAL", "INSPECT", "WILD"].includes(candidate.kind)) ?? actor.privateState.hand[0]!;
  const unowned = BUTTON_CARD_KINDS.find((kind) => !actor.privateState.hand.some((candidate) => candidate.kind === kind) && kind !== card.kind)!;
  const payload = { ...command(game.roomId), cardId: card.cardId, claim: unowned, ...( ["SKIP", "STEAL", "INSPECT"].includes(unowned) ? { targetPlayerId: game.sessions.find((session) => session.playerId !== actor.playerId)!.playerId } : {}) };
  const played = game.owner.playCard(actor.socket, payload);
  assert.equal(played.state.publicRound?.phase, "challenge");
  assert.equal(played.state.publicRound?.publicGameState.currentClaim?.claim, unowned);
  assert.equal(played.state.publicRound?.publicGameState.challenge?.revealedCard, null);
  assert.equal(JSON.stringify(played.state).includes(card.cardId), false);
  assert.equal(JSON.stringify(played.state.publicRound).includes(`"revealedCard":"${card.kind}"`), false);
  game.advance(10);
  assert.equal(game.state().publicRound?.publicGameState.challenge, null);
});

test("first correct challenge wins atomically, cancels the bluff, scores +1/-1, and requires a private extra discard", () => {
  const game = createRound();
  const actor = game.current();
  const card = actor.privateState.hand[0]!;
  const claim = BUTTON_CARD_KINDS.find((kind) => kind !== card.kind && !["SKIP", "STEAL", "INSPECT"].includes(kind))!;
  game.owner.playCard(actor.socket, { ...command(game.roomId), cardId: card.cardId, claim });
  const challengers = game.sockets.filter((socket) => socket !== actor.socket);
  const resolved = game.owner.callBluff(challengers[0]!, command(game.roomId));
  assert.equal(resolved.state.publicRound?.phase, "challenge_reveal");
  assert.equal(resolved.state.publicRound?.publicGameState.challenge?.outcome, "bluff_caught");
  assert.equal(resolved.state.publicRound?.scores.find((entry) => entry.playerId === game.sessions[game.sockets.indexOf(challengers[0]!)]?.playerId)?.score, 1);
  assert.equal(resolved.state.publicRound?.scores.find((entry) => entry.playerId === actor.playerId)?.score, 0);
  assert.throws(() => game.owner.callBluff(challengers[1]!, command(game.roomId)), { message: "CHALLENGE_CLOSED" });
  game.advance(1);
  const penalty = game.privateBySocket.get(actor.socket)!;
  assert.equal(penalty.pendingChoice?.kind, "penalty_discard");
  const discarded = penalty.hand[0]!;
  const after = game.owner.penaltyDiscard(actor.socket, { ...command(game.roomId), cardId: discarded.cardId });
  assert.equal(game.privateBySocket.get(actor.socket)?.hand.length, 4, "normal draw must not refill the punishment loss");
  assert.equal(JSON.stringify(after.state).includes(discarded.cardId), false);
  assert.equal(after.state.publicRound?.publicGameState.counter, 0, "caught bluff effect is cancelled");
});

test("false accusation reveals then resolves the truthful card while the challenger chooses a private discard", () => {
  const game = createRound({ seed: findSeedFor("PLUS_TWO") });
  const actor = game.current();
  const card = actor.privateState.hand.find((candidate) => candidate.kind === "PLUS_TWO")!;
  game.owner.playCard(actor.socket, { ...command(game.roomId), cardId: card.cardId, claim: "PLUS_TWO" });
  const challenger = game.sockets.find((socket) => socket !== actor.socket)!;
  game.owner.callBluff(challenger, command(game.roomId));
  game.advance(1);
  const penalty = game.privateBySocket.get(challenger)!;
  assert.equal(penalty.pendingChoice?.kind, "penalty_discard");
  game.owner.penaltyDiscard(challenger, { ...command(game.roomId), cardId: penalty.hand[0]!.cardId });
  const snapshot = game.state(actor.socket);
  assert.equal(snapshot.publicRound?.publicGameState.counter, 2);
  assert.equal(game.privateBySocket.get(actor.socket)?.hand.length, 5, "normal played card is replaced");
  assert.equal(game.privateBySocket.get(challenger)?.hand.length, 4, "penalty is not replaced");
  assert.equal(snapshot.publicRound?.scores.find((entry) => entry.playerId === actor.playerId)?.score, 1);
});

test("SKIP, STEAL, INSPECT, REVERSE, SHIELD and WILD resolve authoritatively with private effect knowledge", () => {
  for (const kind of ["SKIP", "STEAL", "INSPECT", "REVERSE", "SHIELD", "WILD"] as const) {
    const game = createRound({ seed: findSeedFor(kind) });
    const before = game.current();
    const actorIndex = game.sessions.findIndex((session) => session.playerId === before.playerId);
    const target = game.sessions[(actorIndex + 2) % game.sessions.length]!.playerId;
    const targetSocket = game.socketFor(target);
    const targetCards = game.privateBySocket.get(targetSocket)!.hand.length;
    playTrusted(game, kind, target);
    if (kind === "WILD") {
      assert.equal(game.privateBySocket.get(before.socket)?.pendingChoice?.kind, "wild_value");
      game.owner.chooseWild(before.socket, { ...command(game.roomId), movement: 2 });
      assert.equal(game.state().publicRound?.publicGameState.counter, 2, "Wild applies only the selected value");
    } else {
      const publicGame = game.state().publicRound!.publicGameState;
      assert.equal(publicGame.counter, 1, `${kind} adds the common +1`);
      if (kind === "SKIP") assert.ok(publicGame.skippedPlayerIds.includes(target));
      if (kind === "STEAL") {
        assert.equal(game.privateBySocket.get(targetSocket)?.hand.length, targetCards - 1);
        assert.equal(game.privateBySocket.get(before.socket)?.hand.length, 6);
      }
      if (kind === "INSPECT") assert.equal(game.privateBySocket.get(before.socket)?.inspections.at(-1)?.targetPlayerId, target);
      if (kind === "REVERSE") assert.equal(publicGame.direction, "counter_clockwise");
      if (kind === "SHIELD") assert.ok(publicGame.shieldedPlayerIds.includes(before.playerId));
    }
    const publicWire = JSON.stringify(game.state());
    if (kind === "STEAL") assert.equal(publicWire.includes(game.privateBySocket.get(before.socket)!.hand.at(-2)!.cardId), false);
    if (kind === "INSPECT") assert.equal(publicWire.includes(game.privateBySocket.get(before.socket)!.inspections.at(-1)!.knowledgeId), false);
  }
});

test("Shield consumes itself against the next hostile targeted effect without skipping the protected player", () => {
  const game = createRound({ seed: findSeedFor("SHIELD", "SKIP") });
  const shieldActor = game.current();
  playTrusted(game, "SHIELD");
  const hostileActor = game.current();
  assert.notEqual(hostileActor.playerId, shieldActor.playerId);
  playTrusted(game, "SKIP", shieldActor.playerId);
  const publicGame = game.state().publicRound!.publicGameState;
  assert.equal(publicGame.lastEffect?.type, "shield_blocked");
  assert.equal(publicGame.shieldedPlayerIds.includes(shieldActor.playerId), false);
  assert.equal(publicGame.skippedPlayerIds.includes(shieldActor.playerId), false);
});

test("exact target rewards are applied once, a CONTINUE majority runs exactly one locked Last Chance rotation", () => {
  const game = createRound({ target: 10 });
  driveToTarget(game);
  const secured = game.state().publicRound!;
  const landingId = secured.publicGameState.securedByPlayerId!;
  assert.equal(secured.publicGameState.counter, 10);
  assert.equal(secured.scores.find((entry) => entry.playerId === landingId)?.score, 2);
  for (const standing of secured.scores.filter((entry) => entry.playerId !== landingId)) assert.equal(standing.score, 1);
  for (const socket of game.sockets) game.owner.targetVote(socket, { ...command(game.roomId), choice: "continue" });
  assert.equal(game.state().publicRound?.phase, "last_chance");
  game.advance(600);
  const actors = new Set<string>();
  for (let turn = 0; turn < game.sockets.length; turn++) {
    const actor = game.current();
    assert.equal(actors.has(actor.playerId), false, "Last Chance may include each active player only once");
    actors.add(actor.playerId);
    const card = actor.privateState.hand[0];
    if (card) {
      const target = game.sessions.find((session) => session.playerId !== actor.playerId)!.playerId;
      game.owner.playCard(actor.socket, { ...command(game.roomId), cardId: card.cardId, claim: card.kind, ...(["SKIP", "STEAL", "INSPECT"].includes(card.kind) ? { targetPlayerId: target } : {}) });
      game.advance(10);
      if (game.state().publicRound?.phase === "effect_choice") game.owner.chooseWild(actor.socket, { ...command(game.roomId), movement: -2 });
    } else game.owner.basicButton(actor.socket, command(game.roomId));
  }
  const reveal = game.state().publicRound!;
  assert.equal(actors.size, 4);
  assert.equal(reveal.phase, "round_reveal");
  assert.equal(reveal.publicGameState.counter, 10, "secured target cannot be undone during Last Chance");
  assert.equal(reveal.publicGameState.targetVote?.result, "continue");
  assert.ok(reveal.reveal);
  assert.ok(reveal.roundScore);
});

test("private END votes are counted without identities and an exact tie uses the seeded server coin flip", () => {
  const endGame = createRound({ target: 10, seed: "vote-end" });
  driveToTarget(endGame);
  for (const socket of endGame.sockets) endGame.owner.targetVote(socket, { ...command(endGame.roomId), choice: "end" });
  assert.equal(endGame.state().publicRound?.phase, "round_reveal");
  assert.equal(endGame.state().publicRound?.publicGameState.targetVote?.result, "end");

  const tied = createRound({ target: 10, seed: "vote-tie" });
  driveToTarget(tied);
  tied.owner.targetVote("p0", { ...command(tied.roomId), choice: "end" });
  tied.owner.targetVote("p1", { ...command(tied.roomId), choice: "continue" });
  tied.owner.targetVote("p2", { ...command(tied.roomId), choice: "end" });
  tied.owner.targetVote("p3", { ...command(tied.roomId), choice: "continue" });
  const vote = tied.state().publicRound?.publicGameState.targetVote;
  assert.equal(vote?.tieBroken, true);
  assert.ok(vote?.result === "end" || vote?.result === "continue");
  assert.equal(JSON.stringify(tied.state()).includes("p0\":\"end"), false, "individual vote choices must not be public");
});

test("duplicate play is idempotent, stale turns fail, reconnect restores the current private revision and spectator remains public-only", () => {
  const game = createRound();
  const actor = game.current();
  const card = actor.privateState.hand[0]!;
  const payload = { ...command(game.roomId), cardId: card.cardId, claim: card.kind, ...(["SKIP", "STEAL", "INSPECT"].includes(card.kind) ? { targetPlayerId: game.sessions.find((session) => session.playerId !== actor.playerId)!.playerId } : {}) };
  const first = game.owner.playCard(actor.socket, payload);
  const duplicate = game.owner.playCard(actor.socket, payload);
  assert.equal(duplicate.state.stateVersion, first.state.stateVersion);
  assert.throws(() => game.owner.playCard(actor.socket, { ...payload, requestId: randomUUID() }), { message: "INVALID_GAME_PHASE" });
  const before = game.privateBySocket.get(actor.socket)!;
  game.owner.disconnect(actor.socket);
  const resumed = game.owner.resume("restored", credential(game.sessions.find((session) => session.playerId === actor.playerId)!));
  const restored = game.privateBySocket.get("restored")!;
  assert.equal(restored.secretRule.id, before.secretRule.id);
  assert.equal(restored.revision, before.revision);
  assert.deepEqual(restored.hand, before.hand);
  assert.equal(resumed.state.publicRound?.phase, "challenge");
  assert.equal(game.privateBySocket.has("spectator"), false);
});

test("a permanent departure below two active players abandons the match without a winner or round points", () => {
  const game = createRound();
  game.owner.leave("p1", game.roomId);
  game.owner.leave("p2", game.roomId);
  assert.equal(game.state().status, "in_game", "two remaining players may finish the active match");

  game.owner.leave("p3", game.roomId);
  const survivor = game.state();
  assert.equal(survivor.status, "lobby");
  assert.equal(survivor.publicRound, null);
  assert.deepEqual(survivor.roomNotice, { kind: "match_abandoned", message: "NOT ENOUGH PLAYERS REMAIN.", createdAt: 1001 });
  assert.equal(survivor.players.find((player) => player.playerId === game.sessions[0]!.playerId)?.ready, false);
  assert.equal(JSON.stringify(survivor).includes("winner"), false);
  assert.equal(JSON.stringify(survivor).includes("roundScore"), false);
  assert.equal(game.privateBySocket.get("p0"), null, "abandonment revokes the surviving player's private round delivery");
  assert.equal(game.privateBySocket.has("spectator"), false, "spectators never receive private state");
  assert.equal(game.owner.roomCount, 1);

  game.owner.leave("p0", game.roomId);
  game.owner.leave("spectator", game.roomId);
  assert.equal(game.owner.roomCount, 0, "an abandoned empty room is destroyed normally");
});

test("disconnect reservations preserve the match until grace expires, then abandonment wins over timer scoring", () => {
  const game = createRound({ graceMs: 100 });
  const reconnectingSecretId = game.privateBySocket.get("p1")!.secretRule.id;
  game.owner.disconnect("p1");
  game.owner.disconnect("p2");
  game.owner.disconnect("p3");
  game.advance(50);
  assert.equal(game.state().status, "in_game");

  const resumed = game.owner.resume("p1-restored", credential(game.sessions[1]!));
  assert.equal(resumed.state.status, "in_game");
  assert.equal(game.privateBySocket.get("p1-restored")?.secretRule.id, reconnectingSecretId);
  game.advance(50);
  assert.equal(game.state().status, "in_game", "two authorized active players keep the match alive");
  assert.equal(game.state().players.filter((player) => player.role === "player").length, 2);

  game.owner.disconnect("p1-restored");
  game.advance(100);
  const abandoned = game.state();
  assert.equal(abandoned.status, "lobby");
  assert.equal(abandoned.publicRound, null);
  assert.equal(abandoned.roomNotice?.message, "NOT ENOUGH PLAYERS REMAIN.");
  assert.equal(JSON.stringify(abandoned).includes("match_complete"), false);
  assert.equal(game.privateBySocket.get("p0"), null);
});

test("a disconnected current player times out without auto-playing a private card or receiving artificial points", () => {
  const game = createRound({ graceMs: 5_000 });
  const actor = game.current();
  const handBefore = actor.privateState.hand;
  game.owner.disconnect(actor.socket);
  game.advance(999);
  assert.equal(game.state().publicRound?.publicGameState.currentPlayerId, actor.playerId);
  game.advance(1);
  const afterTimeout = game.state().publicRound!;
  assert.notEqual(afterTimeout.publicGameState.currentPlayerId, actor.playerId);
  assert.equal(afterTimeout.publicGameState.discardCount, 0);
  assert.equal(afterTimeout.publicEvents.at(-1)?.type, "TURN_STARTED");
  assert.ok(afterTimeout.publicEvents.some((event) => event.type === "TURN_TIMED_OUT" && event.actorPlayerId === actor.playerId));
  assert.equal(afterTimeout.scores.find((score) => score.playerId === actor.playerId)?.score, 0);

  const session = game.sessions.find((candidate) => candidate.playerId === actor.playerId)!;
  game.owner.resume("timed-out-restored", credential(session));
  assert.deepEqual(game.privateBySocket.get("timed-out-restored")?.hand, handBefore);
});

test("reconnect restores authorized private state throughout every durable Button V2 gameplay phase", () => {
  const turn = createRound();
  reconnectAtPhase(turn, turn.current().socket, "turn-restored", "turn_action");

  const effect = createRound({ seed: findSeedFor("WILD") });
  const effectActor = playTrusted(effect, "WILD").actor;
  assert.equal(effect.state().publicRound?.phase, "effect_choice");
  reconnectAtPhase(effect, effectActor.socket, "effect-restored", "effect_choice", "wild_value");

  const penalty = createRound();
  const penaltyActor = penalty.current();
  const penaltyCard = penaltyActor.privateState.hand[0]!;
  const falseClaim = BUTTON_CARD_KINDS.find((kind) => kind !== penaltyCard.kind && !["SKIP", "STEAL", "INSPECT"].includes(kind))!;
  penalty.owner.playCard(penaltyActor.socket, { ...command(penalty.roomId), cardId: penaltyCard.cardId, claim: falseClaim });
  penalty.owner.callBluff(penalty.sockets.find((socket) => socket !== penaltyActor.socket)!, command(penalty.roomId));
  penalty.advance(1);
  assert.equal(penalty.state().publicRound?.phase, "penalty_discard");
  reconnectAtPhase(penalty, penaltyActor.socket, "penalty-restored", "penalty_discard", "penalty_discard");

  const vote = createRound({ target: 10 });
  driveToTarget(vote);
  reconnectAtPhase(vote, "p0", "vote-restored", "target_vote", "target_vote");

  const lastChance = createRound({ target: 10 });
  driveToTarget(lastChance);
  for (const socket of lastChance.sockets) lastChance.owner.targetVote(socket, { ...command(lastChance.roomId), choice: "continue" });
  assert.equal(lastChance.state().publicRound?.phase, "last_chance");
  reconnectAtPhase(lastChance, lastChance.current().socket, "last-chance-restored", "last_chance");

  const reveal = createRound({ target: 10 });
  driveToTarget(reveal);
  for (const socket of reveal.sockets) reveal.owner.targetVote(socket, { ...command(reveal.roomId), choice: "end" });
  assert.equal(reveal.state().publicRound?.phase, "round_reveal");
  reconnectAtPhase(reveal, "p0", "reveal-restored", "round_reveal");

  const match = createRound({ target: 10, rounds: 3 });
  for (let round = 1; round <= 3; round++) {
    driveToTarget(match);
    for (const socket of match.sockets) match.owner.targetVote(socket, { ...command(match.roomId), choice: "end" });
    if (round < 3) {
      assert.equal(match.state().publicRound?.phase, "round_reveal");
      match.owner.continueRound("p0", command(match.roomId));
      for (const socket of match.sockets) match.owner.acknowledgeRule(socket, command(match.roomId));
      match.advance(1);
    }
  }
  assert.equal(match.state().publicRound?.phase, "match_complete");
  reconnectAtPhase(match, "p0", "match-restored", "match_complete");
});
