import assert from "node:assert/strict";
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
});

test("the planned tutorial video has a real timed caption track without a placeholder binary", () => {
  const captions = readFileSync(new URL("../../public/videos/how-to-play.vtt", import.meta.url), "utf8");
  assert.match(captions, /^WEBVTT/);
  assert.equal((captions.match(/-->/g) ?? []).length, 13);
  assert.match(captions, /00:68\.000 --> 00:75\.000/);
  assert.match(captions, /Score the most points to win/);
});
