import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameButton, GameTimer, PlayerBadge, ScoreBadge, SecretCard, ConnectionIndicator, RoomCode, GameToast } from "../src/components/ui/index.ts";
import { GameIcon, iconNames } from "../src/components/icons/game-icon.tsx";
import { FullLogo, LogoMark } from "../src/components/brand/logo.tsx";
import { formatRemainingTime } from "../src/components/ui/presentation.ts";
import { HomePage } from "../src/components/home/homepage.tsx";
import { AppProviders } from "../src/app/providers.tsx";
import { projectVisualSeats } from "../src/components/game/seat-projection.ts";
import { tutorialSteps } from "../src/components/home/how-to-play.tsx";
import { EFFECT_BUTTON_CARDS, NUMBER_BUTTON_CARDS, BUTTON_CARD_LABELS, CHAOS_DESCRIPTIONS, PrivatePlayerRoundStateSchema } from "@secret-rules/shared";
import { ButtonCardChoice, ClaimCardPicker, PublicPlayedCard } from "../src/components/game/button-card.tsx";
import { PrivateEffectResult } from "../src/components/game/game-shell.tsx";
import { PublicBoardView } from "../src/components/game/public-board.tsx";
import { GameTable } from "../src/components/game/game-table.tsx";
import { EffectPresentationLayer, type EffectPlayback } from "../src/components/game/effect-presentation.tsx";
import type { EffectButtonCardKind, PublicButtonEffect, PublicPlayer, PublicRoundState } from "@secret-rules/shared";

test("timer formats supplied server timestamps without owning a clock or resolving a round", () => {
  assert.equal(formatRemainingTime(90_000, 30_000), "01:00");
  assert.equal(formatRemainingTime(30_001, 30_000), "00:01");
  assert.equal(formatRemainingTime(20_000, 30_000), "00:00");
  assert.equal(formatRemainingTime(null, 0), "--:--");
  assert.equal(formatRemainingTime(Infinity, 0), "--:--");
  assert.match(renderToStaticMarkup(<GameTimer endTime={30_000} serverTime={0} />), /Time remaining: 00:30/);
});

test("scores and player names are rendered as supplied, safely escaped", () => {
  assert.match(renderToStaticMarkup(<ScoreBadge score={-3} />), /Score: -3/);
  const player = renderToStaticMarkup(<PlayerBadge name={'<script>alert("x")</script>'} host ready />);
  assert.ok(!player.includes("<script>"));
  assert.match(player, /&lt;script&gt;/);
  assert.match(player, /<title>Host<\/title>/);
  assert.match(player, /<title>Ready<\/title>/);
});

test("concealed cards omit their instruction from markup; supplied revealed text is escaped", () => {
  const concealed = renderToStaticMarkup(<SecretCard rule="PUBLIC TEST EXAMPLE" ownerLabel="You" initiallyRevealed={false} interactive />);
  assert.ok(!concealed.includes("PUBLIC TEST EXAMPLE"));
  assert.match(concealed, /aria-expanded="false"/);
  const revealed = renderToStaticMarkup(<SecretCard rule="<img src=x>" ownerLabel="You" interactive />);
  assert.match(revealed, /&lt;img src=x&gt;/);
  assert.match(revealed, /aria-expanded="true"/);
});

test("buttons default to non-submitting semantics and retain native disabled behavior", () => {
  const html = renderToStaticMarkup(<GameButton disabled>Unavailable</GameButton>);
  assert.match(html, /type="button"/);
  assert.match(html, /disabled=""/);
});

test("connection states are named in text, not communicated only by color", () => {
  for (const [state, label] of [["connected", "Connected"], ["reconnecting", "Reconnecting"], ["disconnected", "Disconnected"], ["preview", "Preview · not connected"]] as const) {
    assert.ok(renderToStaticMarkup(<ConnectionIndicator status={state} />).includes(label));
  }
});

test("the complete icon family and standalone logo are accessible SVGs", () => {
  for (const name of iconNames) {
    const html = renderToStaticMarkup(<GameIcon name={name} label={name} />);
    assert.match(html, /viewBox="0 0 24 24"/);
    assert.ok(html.includes(`<title>${name}</title>`));
  }
  assert.match(renderToStaticMarkup(<LogoMark label="SECRET RULES" />), /role="img"/);
  assert.ok(!renderToStaticMarkup(<FullLogo />).includes('d="undefined"'));
});

test("room code is display-only and toast supports accessible persistent feedback", () => {
  const code = renderToStaticMarkup(<RoomCode code="EXAMPLE" />);
  assert.match(code, /EXAMPLE/);
  assert.match(code, /Copy room code/);
  assert.ok(!code.includes("<form"));
  const toast = renderToStaticMarkup(<GameToast message="Preview only" onDismiss={() => {}} />);
  assert.match(toast, /role="status"/);
  assert.match(toast, /Dismiss notification/);
});

test("homepage clearly presents online Button V2 play, full rules entry, and an intentional video fallback", () => {
  const html = renderToStaticMarkup(<AppProviders><HomePage /></AppProviders>);
  assert.match(html, /Public examples\. Real rules stay private\./);
  assert.match(html, /4–10 player online bluffing game/i);
  assert.match(html, /4–10 PLAYERS ONLINE/);
  assert.match(html, /PRIVATE ROOMS · NO DOWNLOAD/);
  assert.match(html, /QUICK GAMEPLAY PREVIEW/);
  assert.match(html, /The Button V2 interactive gameplay preview/);
  assert.match(html, /PLAY THE EXAMPLE/);
  assert.match(html, /SAME GAME\. DIFFERENT RULES\./);
  for (const rule of ["GET DEALT", "PLAY OR ACT", "TRUST OR CHALLENGE", "MOVE THE TABLE", "REVEAL &amp; SCORE"]) assert.match(html, new RegExp(rule));
  assert.match(html, /PLAY PREVIEW/);
  assert.match(html, /GET 4–10 FRIENDS\. SHARE THE CODE\. TRUST NOBODY/);
  assert.match(html, />CREATE ROOM</);
  assert.match(html, />JOIN ROOM</);
  assert.match(html, /SEE IT IN ACTION/);
  assert.match(html, /WATCH HOW A ROUND WORKS/);
  assert.match(html, /60–90 SECOND VIDEO · COMING SOON/);
  assert.match(html, /OPEN INTERACTIVE TUTORIAL/);
  assert.match(html, /\/videos\/how-to-play\.mp4/);
  assert.match(html, /\/videos\/how-to-play\.vtt/);
  assert.match(html, /\/videos\/how-to-play-poster\.webp/);
  assert.match(html, /kind="captions"/);
  assert.doesNotMatch(html, /NO MULTIPLAYER/i);
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("<iframe"));
});

function examplePlayers(count: number): PublicPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    displayName: `Player ${index + 1}`,
    avatarId: "lime",
    playerColor: ["lime", "violet", "coral", "blue"][index % 4] as PublicPlayer["playerColor"],
    role: "player",
    afk: false,
    ready: true,
    connected: true,
    isHost: index === 0,
    joinedAt: index,
  }));
}

function publicRound(players: readonly PublicPlayer[], options: {
  actorId?: string; passedPlayerIds?: string[]; effect?: PublicButtonEffect | null;
} = {}): PublicRoundState {
  const actorId = options.actorId ?? players[0]!.playerId;
  const challenge = options.effect ? null : { challengerPlayerId: null, outcome: null, revealedCard: null, resolvedAt: null, passedPlayerIds: options.passedPlayerIds ?? [] };
  return {
    roundId: "10000000-0000-4000-8000-000000000001", roundNumber: 1, totalRounds: 3, miniGameId: "the-button-v2", buttonMode: "V2",
    phase: options.effect ? "turn_action" : "challenge", serverNow: 1_000, publicObjective: "REACH EXACTLY 20.",
    publicTimer: options.effect ? { kind: "turn", deadlineAt: 11_000, durationMs: 10_000, serverNow: 1_000 } : { kind: "challenge", deadlineAt: 11_000, durationMs: 10_000, serverNow: 1_000 },
    countdownEndsAt: null,
    publicGameState: {
      kind: "the-button-v2", counter: options.effect?.counterAfter ?? 4, target: 20, targetSecured: false, securedByPlayerId: null,
      currentPlayerId: options.effect ? players[1]!.playerId : actorId, direction: options.effect?.type === "reverse" ? "counter_clockwise" : "clockwise",
      deckRemaining: 28, discardCount: 1, handCounts: players.map((player) => ({ playerId: player.playerId, count: 5 })),
      shieldedPlayerIds: options.effect?.type === "shield" ? [actorId] : [], skippedPlayerIds: options.effect?.type === "skip" && options.effect.targetPlayerId ? [options.effect.targetPlayerId] : [],
      currentClaim: options.effect ? null : { actorPlayerId: actorId, claim: "PLUS_TWO", claimedAt: 1_000 }, challenge,
      lastEffect: options.effect ?? null, targetVote: null, lastChanceActive: false, lastChanceTurnsRemaining: 0, basicActionAvailable: false,
    },
    publicPlayerStatuses: players.map((player) => ({ playerId: player.playerId, connected: player.connected, acknowledged: true })),
    publicEvents: [], reveal: null, scores: players.map((player, index) => ({ rank: index + 1, playerId: player.playerId, score: 0 })), roundScore: null, matchResult: null,
  };
}

function effectState(players: readonly PublicPlayer[], card: EffectButtonCardKind, type: PublicButtonEffect["type"], movement: number, targetPlayerId: string | null = null): PublicButtonEffect {
  return { effectId: randomUUID(), card, type, actorPlayerId: players[0]!.playerId, targetPlayerId, movement, counterBefore: 4, counterAfter: Math.max(0, 4 + movement), at: 1_000 };
}

test("private controls keep one real front seat and shield ownership follows each stable player ID", () => {
  const names = ["GROOT", "KIV", "NIDA", "NOOR"];
  const players = examplePlayers(4).map((player, index) => ({ ...player, displayName: names[index]! }));
  for (const viewer of players) for (const protectedPlayer of players) {
    const round = publicRound(players);
    round.publicGameState.shieldedPlayerIds = [protectedPlayer.playerId];
    const html = renderToStaticMarkup(<GameTable players={players} playerId={viewer.playerId} round={round} acknowledgedPlayerIds={new Set()} choosePlayer={() => {}} eventFeed={null} privateControls={<div>PRIVATE HAND</div>} privateSecondaryAction={<button>VIEW SECRET</button>}><div>PUBLIC TABLE</div></GameTable>);
    const seats = html.match(/<button class="player-seat"[^>]*>/g) ?? [];
    assert.equal(seats.length, players.length);
    for (const player of players) assert.equal(seats.filter((seat) => seat.includes(`data-player-id="${player.playerId}"`)).length, 1);
    const shields = seats.filter((seat) => seat.includes('data-shielded="true"'));
    assert.equal(shields.length, 1);
    assert.ok(shields[0]!.includes(`data-player-id="${protectedPlayer.playerId}"`));
    const dock = html.slice(html.indexOf('<section class="game-private-region"'));
    assert.ok(dock.includes(`data-player-id="${viewer.playerId}"`));
    assert.match(dock, /data-seat-position="front"/);
    assert.match(dock, /VIEW SECRET/);
    assert.match(dock, /id="private-actions"/);
  }
});

test("Last Chance reconnect renders only authoritative compact status and never replays the large celebration", () => {
  const players = examplePlayers(4);
  const base = publicRound(players);
  const lastChance: PublicRoundState = {
    ...base,
    phase: "last_chance",
    publicTimer: { kind: "turn", deadlineAt: 11_000, durationMs: 10_000, serverNow: 1_000 },
    publicGameState: {
      ...base.publicGameState,
      counter: 30,
      target: 30,
      targetSecured: true,
      securedByPlayerId: players[0]!.playerId,
      currentPlayerId: players[1]!.playerId,
      currentClaim: null,
      challenge: null,
      lastChanceActive: true,
      lastChanceTurnsRemaining: 3,
    },
  };
  const html = renderToStaticMarkup(<PublicBoardView round={lastChance} players={players} selfId={players[0]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
  assert.match(html, /✓ TARGET SECURED/);
  assert.match(html, /30 \/ 30 · 3 TURNS LEFT/);
  assert.doesNotMatch(html, /target-secured--celebration/);
  assert.doesNotMatch(html, /last-chance-intro/);

  // Last Chance uses ordinary action/challenge phases after its short intro.
  for (const phase of ["turn_action", "challenge", "challenge_reveal", "penalty_discard"] as const) {
    const duringTurn = renderToStaticMarkup(<PublicBoardView round={{ ...lastChance, phase }} players={players} selfId={players[0]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
    assert.match(duringTurn, /30 \/ 30 · 3 TURNS LEFT/);
    assert.doesNotMatch(duringTurn, /target-secured--celebration|last-chance-intro/);
  }
  const completed = renderToStaticMarkup(<PublicBoardView round={{ ...lastChance, phase: "round_reveal" }} players={players} selfId={players[0]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
  assert.doesNotMatch(completed, /class="target-secured-compact"/);

  const source = readFileSync(new URL("../../src/components/game/public-board.tsx", import.meta.url), "utf8");
  assert.match(source, /!previousTargetSecured\.current && game\.targetSecured && round\.phase === "target_vote"/);
  assert.match(source, /previousPhase\.current === "target_vote" && round\.phase === "last_chance"/);
  assert.match(source, /presentation === "targetHitCelebration"\) hideTimeout = setTimeout\(\(\) => setPresentation\("hidden"\), 1500\)/);
  assert.match(source, /presentation === "lastChanceIntro"\) hideTimeout = setTimeout\(\(\) => setPresentation\("hidden"\), 1100\)/);
});

test("POV seat projection places every player at the front without mutating authoritative identity or order", () => {
  for (let count = 4; count <= 10; count++) {
    const players = examplePlayers(count);
    const authoritativeIds = players.map((player) => player.playerId);
    for (const viewer of players) {
      const projection = projectVisualSeats(players, viewer.playerId);
      assert.equal(projection.orientation, "player");
      assert.deepEqual(projection.logicalPlayerIds, authoritativeIds);
      assert.equal(projection.seats[0]?.player, viewer, "the original player object remains the action target");
      assert.equal(projection.seats[0]?.local, true);
      assert.equal(projection.seats[0]?.position, "front");
      assert.equal(Math.abs(projection.seats[0]?.angle ?? 0), 180);
      assert.equal(new Set(projection.seats.map((seat) => seat.player.playerId)).size, count);
      assert.equal(new Set(projection.seats.map((seat) => seat.angle)).size, count);
    }
    assert.deepEqual(players.map((player) => player.playerId), authoritativeIds);
  }
});

test("spectators keep a neutral projection and stable player POV survives socket replacement", () => {
  const players = examplePlayers(6);
  const neutral = projectVisualSeats(players, "00000000-0000-4000-8000-999999999999");
  assert.equal(neutral.orientation, "spectator");
  assert.equal(neutral.seats.some((seat) => seat.local), false);
  assert.deepEqual(neutral.seats.map((seat) => seat.player.playerId), players.map((player) => player.playerId));

  const playerId = players[4]!.playerId;
  const beforeReconnect = projectVisualSeats(players, playerId);
  const afterReconnect = projectVisualSeats(players.map((player) => ({ ...player, connected: true })), playerId);
  assert.equal(beforeReconnect.seats[0]?.player.playerId, playerId);
  assert.equal(afterReconnect.seats[0]?.player.playerId, playerId);
  assert.deepEqual(afterReconnect.seats.map((seat) => seat.player.playerId), beforeReconnect.seats.map((seat) => seat.player.playerId));
});

test("nine- and ten-player POV layouts keep every opponent out of the private hand edge", () => {
  for (const count of [9, 10]) {
    const projection = projectVisualSeats(examplePlayers(count), examplePlayers(count)[0]!.playerId);
    const opponentAngles = projection.seats.filter((seat) => !seat.local).map((seat) => seat.angle);
    assert.ok(opponentAngles.every((angle) => angle >= -98 && angle <= 98));
    assert.equal(Math.max(...opponentAngles), 98);
    assert.equal(Math.min(...opponentAngles), -98);
  }
});

test("POV rotation cannot change authoritative turns, direction, skips, challenges, or targeted player IDs", () => {
  const players = examplePlayers(4);
  const facts = Object.freeze({
    logicalOrder: players.map((player) => player.playerId),
    currentPlayerId: players[1]!.playerId,
    direction: "counter_clockwise" as const,
    skippedPlayerId: players[2]!.playerId,
    targetedPlayerId: players[3]!.playerId,
    challengerPlayerId: players[0]!.playerId,
  });
  for (const viewer of players) {
    const projection = projectVisualSeats(players, viewer.playerId);
    assert.deepEqual(projection.logicalPlayerIds, facts.logicalOrder);
    assert.equal(projection.seats.find((seat) => seat.player.playerId === facts.currentPlayerId)?.player, players[1]);
    assert.equal(projection.seats.find((seat) => seat.player.playerId === facts.skippedPlayerId)?.player.playerId, facts.skippedPlayerId);
    assert.equal(projection.seats.find((seat) => seat.player.playerId === facts.targetedPlayerId)?.player.playerId, facts.targetedPlayerId);
    assert.equal(projection.seats.find((seat) => seat.player.playerId === facts.challengerPlayerId)?.player.playerId, facts.challengerPlayerId);
    assert.equal(facts.direction, "counter_clockwise", "direction remains a server fact, not a CSS seat order");
  }
});

test("the guided tutorial covers the complete Button V2 round in ten ordered steps", () => {
  assert.deepEqual(tutorialSteps.map((step) => step.title), [
    "GET YOUR CARDS", "GET YOUR SECRET", "PLAY A NUMBER CARD", "CLAIM A NUMBER", "TRUST OR CALL BLUFF",
    "CHALLENGE RESULT", "PLAY EFFECTS DIRECTLY", "HIT THE TARGET", "END OR CONTINUE", "REVEAL YOUR SECRET",
  ]);
  const source = readFileSync(new URL("../../src/components/home/how-to-play.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useMultiplayer|RoomOwner|\.playCard\(|\.callBluff\(/);
  assert.match(source, /Guided public example/);
  assert.match(source, /tutorial-pov__seats/);
  assert.match(source, /data-layer="tutorial-foreground"/);
  const css = readFileSync(new URL("../../src/styles/home.css", import.meta.url), "utf8");
  const seats = css.match(/\.tutorial-pov__seats \{([^}]+)\}/)?.[1] ?? "";
  const foreground = css.match(/\.tutorial-pov__center \{([^}]+)\}/)?.[1] ?? "";
  assert.match(seats, /z-index: 1/);
  assert.match(foreground, /z-index: 3/);
});

test("the planned tutorial video has a real timed caption track without a placeholder binary", () => {
  const captions = readFileSync(new URL("../../public/videos/how-to-play.vtt", import.meta.url), "utf8");
  assert.match(captions, /^WEBVTT/);
  assert.equal((captions.match(/-->/g) ?? []).length, 13);
  assert.match(captions, /00:68\.000 --> 00:75\.000/);
  assert.match(captions, /Score the most points to win/);
  const videoSource = readFileSync(new URL("../../src/components/home/video-section.tsx", import.meta.url), "utf8");
  const videoCss = readFileSync(new URL("../../src/styles/home.css", import.meta.url), "utf8");
  assert.match(videoSource, /poster=\{VIDEO_POSTER_PATH\}/);
  assert.match(videoSource, /aria-label="How to play Secret Rules: The Button V2"/);
  assert.match(videoSource, /kind="captions"/);
  assert.match(videoCss, /\.how-video\[data-available="true"\] \.how-video__poster \{ display: none; \}/);
});

test("homepage example Secrets use one 5:7 body and reusable responsive copy variants", () => {
  const html = renderToStaticMarkup(<AppProviders><HomePage /></AppProviders>);
  assert.equal((html.match(/hero-card hero-card--[abc]/g) ?? []).length, 3);
  assert.equal((html.match(/data-copy-size="medium"/g) ?? []).length >= 3, true);
  assert.match(html, /SUCCESSFULLY\nBLUFF 3 TIMES\./);
  const component = readFileSync(new URL("../../src/components/ui/secret-card.tsx", import.meta.url), "utf8");
  const componentsCss = readFileSync(new URL("../../src/styles/components.css", import.meta.url), "utf8");
  const homeCss = readFileSync(new URL("../../src/styles/home.css", import.meta.url), "utf8");
  assert.match(component, /secret-card--copy-\$\{copySize\}/);
  assert.match(component, /longestWord/);
  assert.match(componentsCss, /\.secret-card__body[\s\S]*?overflow: hidden/);
  assert.match(componentsCss, /overflow-wrap: anywhere/);
  assert.match(homeCss, /\.hero-card[\s\S]*?aspect-ratio: 5 \/ 7/);
  assert.match(homeCss, /--hero-secret-card-width: 250px/);
  assert.match(homeCss, /\.hero-card \{[\s\S]*?width: var\(--hero-secret-card-width\)/);
  for (const variant of ["short", "medium", "long"]) assert.match(homeCss, new RegExp(`hero-card\\.secret-card--copy-${variant}`));
  for (const id of ["a", "b", "c"]) {
    const bodies = [...homeCss.matchAll(new RegExp(`\\.hero-card--${id} \\{([^}]+)\\}`, "g"))].map((match) => match[1] ?? "");
    assert.ok(bodies.length > 0);
    for (const body of bodies) {
      assert.doesNotMatch(body, /height:/, `hero card ${id} must derive height from the shared ratio`);
      assert.doesNotMatch(body, /width:/, `hero card ${id} must use the shared physical width`);
      assert.doesNotMatch(body, /scale(?:X|Y)?\s*\(/, `hero card ${id} must not use a size-changing transform`);
    }
  }
});

test("the claim-card picker exposes only the five Number identities as keyboard buttons", () => {
  const html = renderToStaticMarkup(<ClaimCardPicker value="PLUS_TWO" disabled={false} onSelect={() => {}} />);
  assert.equal((html.match(/class="button-card button-card--claim/g) ?? []).length, NUMBER_BUTTON_CARDS.length);
  for (const kind of NUMBER_BUTTON_CARDS) assert.match(html, new RegExp(`Public claim: ${BUTTON_CARD_LABELS[kind].replace("+", "\\+")}`));
  for (const kind of EFFECT_BUTTON_CARDS) assert.doesNotMatch(html, new RegExp(`Public claim: ${BUTTON_CARD_LABELS[kind]}`));
  assert.equal((html.match(/type="button"/g) ?? []).length, NUMBER_BUTTON_CARDS.length);
  assert.match(html, /aria-pressed="true"/);
});

test("real-card and claim-card selections have distinct private and public labels", () => {
  const real = renderToStaticMarkup(<ButtonCardChoice kind="MINUS_TWO" purpose="real" selected onClick={() => {}} />);
  const claim = renderToStaticMarkup(<ButtonCardChoice kind="PLUS_TWO" purpose="claim" selected onClick={() => {}} />);
  assert.match(real, /Selected real card: -2/);
  assert.match(real, /REAL CARD · PRIVATE/);
  assert.doesNotMatch(real, /PUBLIC CLAIM/);
  assert.match(claim, /Public claim: \+2/);
  assert.match(claim, /PUBLIC CLAIM/);
});

test("the authorized INSPECT result renders the actual Button card and private-only message", () => {
  const inspectorId = randomUUID();
  const targetId = randomUUID();
  const state = PrivatePlayerRoundStateSchema.parse({
    roundId: randomUUID(), roundNumber: 1, miniGameId: "the-button-v2", playerId: inspectorId, revision: 3, hand: [],
    secretRule: {
      id: randomUUID(), templateId: "BUTTON_V2_BLUFF_SUCCESS", identity: `BUTTON_V2_BLUFF_SUCCESS:${inspectorId}`,
      miniGameId: "the-button-v2", category: "personal", rarity: "common", difficulty: "medium",
      parameters: { actionCount: 3 }, conflictTags: [], compatibilityTags: [], incompatibilityTags: [],
      description: "SUCCESSFULLY BLUFF 3 TIMES.", shortDescription: "BLUFF 3 TIMES.", progressType: "counter",
      rewardWeight: 1, visibility: "private", evaluatorId: "rule:button-v2-bluff-success",
    },
    privateProgress: { status: "in_progress", current: 0, target: 3, summary: "0 / 3" },
    privateTargetPlayerId: null, acknowledgedAt: 1,
    inspections: [{ knowledgeId: randomUUID(), targetPlayerId: targetId, card: "PLUS_TWO", inspectedAt: 20 }],
    cardTransfers: [], pendingChoice: null,
  });
  const players = [
    { playerId: inspectorId, displayName: "Groot", avatarId: "lime", playerColor: "lime", role: "player", afk: false, ready: true, connected: true, isHost: true, joinedAt: 1 },
    { playerId: targetId, displayName: "Nida", avatarId: "violet", playerColor: "violet", role: "player", afk: false, ready: true, connected: true, isHost: false, joinedAt: 2 },
  ] as const;
  const html = renderToStaticMarkup(<AppProviders><PrivateEffectResult state={state} players={players} /></AppProviders>);
  assert.match(html, /INSPECT RESULT/);
  assert.match(html, /PRIVATE · ONLY YOU CAN SEE THIS/);
  assert.match(html, /YOU INSPECTED NIDA/);
  assert.match(html, /data-kind="PLUS_TWO"/);
  assert.match(html, />\+2</);
  assert.match(html, /THIS CARD STAYS IN NIDA’S HAND/);
  assert.match(html, />GOT IT</);
});

test("the public played card conceals Number identity but renders direct Effects face-up", () => {
  const concealed = renderToStaticMarkup(<PublicPlayedCard animationKey="hidden" revealedKind={null} />);
  assert.match(concealed, /Face-down SECRET RULES card/);
  for (const label of Object.values(BUTTON_CARD_LABELS)) assert.equal(concealed.includes(`>${label}<`), false);
  const revealed = renderToStaticMarkup(<PublicPlayedCard animationKey="revealed" revealedKind="MINUS_TWO" />);
  assert.match(revealed, />-2</);
  assert.match(revealed, /data-revealed="true"/);
  const effect = renderToStaticMarkup(<PublicPlayedCard animationKey="effect" revealedKind={null} faceUpKind="INSPECT" />);
  assert.match(effect, />INSPECT</);
  assert.match(effect, /data-face-up="true"/);
});

test("eligible opponents receive authoritative CALL BLUFF and PASS controls while actors and spectators do not", () => {
  const players = examplePlayers(4);
  const round = publicRound(players);
  const eligible = renderToStaticMarkup(<PublicBoardView round={round} players={players} selfId={players[1]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} onCallBluff={() => {}} onPassChallenge={() => {}} />);
  assert.match(eligible, />CALL BLUFF</);
  assert.match(eligible, />PASS</);
  assert.match(eligible, /PLAYER 2<\/b> · THINKING/);
  const accepted = renderToStaticMarkup(<PublicBoardView round={publicRound(players, { passedPlayerIds: [players[1]!.playerId] })} players={players} selfId={players[1]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} onCallBluff={() => {}} onPassChallenge={() => {}} />);
  assert.match(accepted, />YOU PASSED</);
  assert.match(accepted, /PLAYER 2<\/b> · PASSED/);
  const actor = renderToStaticMarkup(<PublicBoardView round={round} players={players} selfId={players[0]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} onCallBluff={() => {}} onPassChallenge={() => {}} />);
  assert.doesNotMatch(actor, />CALL BLUFF</);
  assert.doesNotMatch(actor, />PASS</);
  const spectator = renderToStaticMarkup(<PublicBoardView round={round} players={players} selfId={null} spectator disabled={false} now={1_000} tableNotice={null} onCallBluff={() => {}} onPassChallenge={() => {}} />);
  assert.doesNotMatch(spectator, />CALL BLUFF</);
  assert.doesNotMatch(spectator, /class="[^"]*pass-challenge/);
});

test("Effect presentation names public outcomes without leaking INSPECT or STEAL card identities", () => {
  const players = examplePlayers(4);
  const targetId = players[1]!.playerId;
  const inspect = renderToStaticMarkup(<PublicBoardView round={publicRound(players, { effect: effectState(players, "INSPECT", "inspect", 1, targetId) })} players={players} selfId={players[2]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
  assert.match(inspect, /data-face-up="true"/);
  assert.match(inspect, /PLAYER 1<\/b> INSPECTED <strong>PLAYER 2/);
  assert.match(inspect, /RESULT SENT PRIVATELY/);
  assert.doesNotMatch(inspect, /actual card|PLUS_TWO/iu);
  const steal = renderToStaticMarkup(<PublicBoardView round={publicRound(players, { effect: effectState(players, "STEAL", "steal", 1, targetId) })} players={players} selfId={players[2]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
  assert.match(steal, /PLAYER 1<\/b> STOLE A CARD <strong>FROM PLAYER 2/);
  assert.match(steal, /CARD IDENTITY STAYS PRIVATE/);
  assert.doesNotMatch(steal, /actual card/iu);
  const effect = effectState(players, "STEAL", "steal", 1, targetId) as EffectPlayback["effect"];
  const transfer = renderToStaticMarkup(<EffectPresentationLayer playback={{ effect, origin: null, motion: "full", phase: "activate" }} selfId={players[0]!.playerId} onAdvance={() => {}} />);
  assert.match(transfer, /effect-playback-layer/);
  assert.match(transfer, /data-effect-type="steal"/);
  assert.match(transfer, /data-phase="activate"/);
  assert.doesNotMatch(transfer, /PLUS_ONE|PLUS_TWO|PLUS_THREE|MINUS_ONE|MINUS_TWO/);
});

test("all six Effects mount the shared face-up playback layer from an authoritative effect snapshot", () => {
  const players = examplePlayers(4);
  const cases = ["INSPECT", "STEAL", "SKIP", "REVERSE", "SHIELD", "WILD"] as const;
  for (const card of cases) {
    const type = card === "INSPECT" ? "inspect" : card === "STEAL" ? "steal" : card === "SKIP" ? "skip" : card === "REVERSE" ? "reverse" : card === "SHIELD" ? "shield" : "movement";
    const target = ["INSPECT", "STEAL", "SKIP"].includes(card) ? players[1]!.playerId : card === "SHIELD" ? players[0]!.playerId : null;
    const effect = effectState(players, card, type, card === "WILD" ? 2 : 1, target) as EffectPlayback["effect"];
    const html = renderToStaticMarkup(<EffectPresentationLayer playback={{ effect, origin: null, motion: "full", phase: "pickup" }} selfId={players[0]!.playerId} onAdvance={() => {}} />);
    assert.match(html, new RegExp(`data-effect-kind="${card}"`));
    assert.match(html, /data-phase="pickup"/);
    assert.match(html, /data-motion="full"/);
    const reduced = renderToStaticMarkup(<EffectPresentationLayer playback={{ effect, origin: null, motion: "reduced", phase: "activate" }} selfId={players[0]!.playerId} onAdvance={() => {}} />);
    assert.match(reduced, /data-motion="reduced"/);
    assert.match(reduced, /effect-reduced-confirmation/);
    assert.match(reduced, new RegExp(`${BUTTON_CARD_LABELS[card].replace("+", "\\+")} · FACE-UP`));
    assert.doesNotMatch(reduced, /effect-card-clone|effect-steal-transfer/);
  }
});

test("SKIP, REVERSE, SHIELD, block, and WILD render distinct authoritative feedback", () => {
  const players = examplePlayers(4);
  const targetId = players[1]!.playerId;
  const render = (effect: PublicButtonEffect) => renderToStaticMarkup(<PublicBoardView round={publicRound(players, { effect })} players={players} selfId={players[2]!.playerId} spectator={false} disabled={false} now={1_000} tableNotice={null} />);
  assert.match(render(effectState(players, "SKIP", "skip", 1, targetId)), /PLAYER 2 WILL SKIP THEIR NEXT TURN/);
  assert.match(render(effectState(players, "REVERSE", "reverse", 1)), /DIRECTION REVERSED/);
  assert.match(render(effectState(players, "SHIELD", "shield", 1, players[0]!.playerId)), /SHIELD ARMED/);
  assert.match(render(effectState(players, "STEAL", "shield_blocked", 1, targetId)), /SHIELD BLOCKED IT/);
  const wild = render(effectState(players, "WILD", "movement", 2));
  assert.match(wild, /wild-effect-value/);
  assert.match(wild, /<span>WILD<\/span><strong>\+2<\/strong>/);
  assert.match(wild, /<small>4 → 6<\/small>/);
});

test("Button V2 polish keeps turn, claim, target, hover, privacy, and reduced-motion contracts explicit", () => {
  const source = ["game-shell.tsx", "public-board.tsx", "private-effect-result.tsx", "play-presentation.tsx", "effect-presentation.tsx"]
    .map((file) => readFileSync(new URL(`../../src/components/game/${file}`, import.meta.url), "utf8"))
    .join("\n");
  const css = readFileSync(new URL("../../src/styles/game.css", import.meta.url), "utf8");
  assert.match(source, /YOUR TURN/);
  assert.match(source, /’S TURN/);
  assert.match(source, /sound\.play\("yourTurn"\)/);
  assert.match(source, /THE TABLE TRUSTS IT/);
  assert.match(source, /THE REAL CARD STAYS HIDDEN/);
  assert.match(source, /data-player-id=\{player\.playerId\}/);
  assert.match(source, /revealedKind=\{challenge\?\.revealedCard \?\? null\}/);
  assert.match(source, /playType: "number", cardId: selected\.cardId, claim/);
  assert.match(source, /playType: "effect", cardId: selected\.cardId/);
  assert.match(source, /targetPlayerId: effectTargetId/);
  assert.doesNotMatch(source, /realTargetPlayerId|claimTargetPlayerId|claimTargetId/);
  assert.match(source, /DIRECT ACTION · FACE-UP/);
  assert.match(source, /This target becomes public when the Effect is played/);
  assert.match(source, /WILD gets no extra \+1/);
  assert.match(source, /INSPECT RESULT/);
  assert.match(source, /CARD STOLEN/);
  assert.match(source, /PRIVATE · ONLY YOU CAN SEE THIS/);
  assert.doesNotMatch(source, /cardIdToInspect/);
  const stableCallBluffRule = css.match(/\.call-bluff,.*?\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(stableCallBluffRule, /position: relative/);
  assert.match(stableCallBluffRule, /left: auto; top: auto/);
  assert.match(stableCallBluffRule, /transform: none !important/);
  assert.doesNotMatch(stableCallBluffRule, /translate[XY]?\(/);
  const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /Button V2 presentation only/);
  assert.match(css, /effect-playback-layer/);
  assert.match(css, /effect-card-pickup 90ms/);
  assert.match(css, /effect-card-travel 440ms/);
  assert.match(css, /effect-steal-transfer 620ms/);
  assert.match(css, /player-seat__effect-cue/);
  assert.match(css, /effect-target-focus/);
  assert.match(css, /private-card-forward/);
  assert.match(css, /data-reduce-motion="true"/);
  assert.match(globals, /data-reduce-motion/);
  assert.doesNotMatch(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /useEffectPresentationQueue/);
  assert.match(source, /onAnimationEnd=\{finishPhase\}/);
  assert.doesNotMatch(source, /effectPresentationTimer/);
});

test("Secret Intensity copy is explicit about difficulty without changing mechanics", () => {
  assert.deepEqual(CHAOS_DESCRIPTIONS, {
    chill: "Easier secrets. Good for learning.",
    normal: "Balanced secrets and player interaction.",
    chaos: "Harder, riskier and more conflicting secrets.",
  });
  const settings = readFileSync(new URL("../../src/components/lobby/room-settings.tsx", import.meta.url), "utf8");
  assert.match(settings, />SECRET INTENSITY<select/);
  assert.match(settings, /Secret Intensity changes private objective difficulty, risk, conflicts, and interaction/);
  assert.match(settings, /It does not change the deck, Effect strength, timers, or scoring/);
});

test("brand metadata wires the complete local lime-document icon family at valid PNG sizes", () => {
  const layout = readFileSync(new URL("../../src/app/layout.tsx", import.meta.url), "utf8");
  const favicon = readFileSync(new URL("../../public/brand/favicon.svg", import.meta.url), "utf8");
  assert.match(layout, /title: "SECRET RULES"/);
  assert.match(layout, /favicon-16\.png/);
  assert.match(layout, /favicon-32\.png/);
  assert.match(layout, /secret-rules-app-icon-192\.png/);
  assert.match(layout, /secret-rules-app-icon\.png/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(favicon, /fill="#d4f462"/);
  assert.match(favicon, /fill="#11150f"/);
  assert.match(favicon, /<path fill="#11150f" d="M19 35/);
  for (const [file, size] of [["favicon-16.png", 16], ["favicon-32.png", 32], ["apple-touch-icon.png", 180], ["secret-rules-app-icon-192.png", 192], ["secret-rules-app-icon.png", 512]] as const) {
    const png = readFileSync(new URL(`../../public/brand/${file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
