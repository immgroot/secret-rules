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
import { BUTTON_CARD_KINDS, BUTTON_CARD_LABELS, PrivatePlayerRoundStateSchema } from "@secret-rules/shared";
import { ButtonCardChoice, ClaimCardPicker, PublicPlayedCard } from "../src/components/game/button-card.tsx";
import { PrivateEffectResult } from "../src/components/game/game-shell.tsx";
import type { PublicPlayer } from "@secret-rules/shared";

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
  for (const rule of ["GET DEALT", "PLAY &amp; CLAIM", "TRUST OR CHALLENGE", "MOVE THE TABLE", "REVEAL &amp; SCORE"]) assert.match(html, new RegExp(rule));
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
    "GET YOUR CARDS", "GET YOUR SECRET", "PLAY A REAL CARD", "MAKE YOUR CLAIM", "TRUST OR CALL BLUFF",
    "CHALLENGE RESULT", "USE THE CARDS", "HIT THE TARGET", "END OR CONTINUE", "REVEAL YOUR SECRET",
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

test("the claim-card picker exposes every valid claim identity as a keyboard button", () => {
  const html = renderToStaticMarkup(<ClaimCardPicker value="PLUS_TWO" disabled={false} onSelect={() => {}} />);
  assert.equal((html.match(/class="button-card button-card--claim/g) ?? []).length, BUTTON_CARD_KINDS.length);
  for (const kind of BUTTON_CARD_KINDS) assert.match(html, new RegExp(`Public claim: ${BUTTON_CARD_LABELS[kind].replace("+", "\\+")}`));
  assert.equal((html.match(/type="button"/g) ?? []).length, BUTTON_CARD_KINDS.length);
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

test("the public played card conceals identity until a reveal-safe card kind is supplied", () => {
  const concealed = renderToStaticMarkup(<PublicPlayedCard animationKey="hidden" revealedKind={null} />);
  assert.match(concealed, /Face-down SECRET RULES card/);
  for (const label of Object.values(BUTTON_CARD_LABELS)) assert.equal(concealed.includes(`>${label}<`), false);
  const revealed = renderToStaticMarkup(<PublicPlayedCard animationKey="revealed" revealedKind="MINUS_TWO" />);
  assert.match(revealed, />-2</);
  assert.match(revealed, /data-revealed="true"/);
});

test("Button V2 polish keeps turn, claim, target, hover, privacy, and reduced-motion contracts explicit", () => {
  const source = ["game-shell.tsx", "public-board.tsx", "private-effect-result.tsx", "play-presentation.tsx"]
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
  assert.match(source, /cardId: selected\.cardId,\s+claim/);
  assert.match(source, /realTargetPlayerId: realTargetId/);
  assert.match(source, /targetPlayerId: claimTargetId/);
  assert.match(source, /STAGE A · PRIVATE EFFECT TARGET/);
  assert.match(source, /PUBLIC CLAIM TARGET/);
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
  assert.match(globals, /data-reduce-motion/);
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
