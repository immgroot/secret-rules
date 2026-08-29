import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameButton, GameTimer, PlayerBadge, ScoreBadge, SecretCard, ConnectionIndicator, RoomCode, GameToast } from "../src/components/ui/index.ts";
import { GameIcon, iconNames } from "../src/components/icons/game-icon.tsx";
import { FullLogo, LogoMark } from "../src/components/brand/logo.tsx";
import { formatRemainingTime } from "../src/components/ui/presentation.ts";
import { HomePage } from "../src/components/home/homepage.tsx";
import { AppProviders } from "../src/app/providers.tsx";

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

test("homepage preserves the isolated demo and presents real lobby entry controls", () => {
  const html = renderToStaticMarkup(<AppProviders><HomePage /></AppProviders>);
  assert.match(html, /Public examples\. Real rules stay private\./);
  assert.match(html, /LOCAL DEMO · NO MULTIPLAYER/);
  assert.match(html, /aria-label="Demo counter: 12"/);
  assert.match(html, /aria-label="Press the demo button"/);
  assert.match(html, /SAME GAME\. DIFFERENT RULES\./);
  assert.ok(!html.includes("A PARTY GAME OF HIDDEN AGENDAS"));
  assert.match(html, /RESET DEMO/);
  assert.match(html, /THE BUTTON IS LIVE\. BRING 4–10 FRIENDS/);
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("<iframe"));
});
