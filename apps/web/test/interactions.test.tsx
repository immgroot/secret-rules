import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { demoFrames, demoReducer, initialDemo, scheduleDemoStep, type DemoState, type DemoAction } from "../src/components/home/demo/script.ts";
import { INITIAL_TUTORIAL_STATE, inspectCard, logoClickCount, tutorialCanContinue, tutorialReducer, tutorialStateReducer, type TutorialState, type TutorialStep } from "../src/components/home/interaction-state.ts";
import { SecretCard } from "../src/components/ui/secret-card.tsx";
import { createPreferenceStore, DEFAULT_PREFERENCES, isMotionReduced, parsePreferences, PREFERENCES_KEY, type Preferences } from "../src/preferences/store.ts";
import { createSoundController, soundEvents, soundGain, type SoundEvent } from "../src/audio/sounds.ts";
import { eventsAfter, latestPrivateEffect, privateEffectIsVisible, publicEffectLabel, shouldNotifyLocalTurn } from "../src/components/game/button-presentation.ts";
import { ChatMessages } from "../src/components/lobby/chat-panel.tsx";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "@secret-rules/shared";

test("chat renders hostile markup as literal text and personal mute removes it only for that viewer", () => {
  const authorId = randomUUID();
  const message: ChatMessage = { authorId, messageId: randomUUID(), displayName: "Milo", avatarId: "lime", playerColor: "lime", role: "player", text: '<script>alert("x")</script> hi 🙂', sentAt: 1000 };
  const visible = renderToStaticMarkup(<ChatMessages messages={[message]} mutedIds={[]} />);
  assert.match(visible, /&lt;script&gt;/);
  assert.equal(visible.includes("<script>"), false);
  assert.match(visible, /hi 🙂/);
  assert.equal(renderToStaticMarkup(<ChatMessages messages={[message]} mutedIds={[authorId]} />), "");
  assert.equal(renderToStaticMarkup(<ChatMessages messages={[message]} mutedIds={[]} />), visible);
});

function advance(state: DemoState) { return demoReducer(state, { type: "advance", run: state.run, from: state.stage }); }

test("local Button V2 demo follows the isolated claim/challenge/reveal script", () => {
  let state = demoReducer(initialDemo, { type: "press" });
  const messages: string[] = [];
  let duration = 0;
  while (demoFrames[state.stage].next) {
    messages.push(demoFrames[state.stage].message);
    duration += demoFrames[state.stage].delay;
    state = advance(state);
  }
  assert.deepEqual(messages, ["YOU CLAIM +2", "LIV CALLS BLUFF", "ACTUAL CARD: -2", "BLUFF CAUGHT", "LIV +1 · YOU -1", "BUT WHY DID YOU BLUFF?"]);
  assert.equal(duration, 7_550);
  assert.equal(state.stage, "complete");
  assert.equal(advance(state), state);
});

test("repeat presses cannot accelerate the demo; reset rejects callbacks from a previous run", () => {
  let state = demoReducer(initialDemo, { type: "press" });
  assert.equal(demoReducer(state, { type: "press" }), state);
  const stale: DemoAction = { type: "advance", run: state.run, from: state.stage };
  state = demoReducer(state, { type: "reset" });
  assert.equal(demoFrames[state.stage].message, "PLAY THE EXAMPLE");
  state = demoReducer(state, { type: "press" });
  assert.equal(demoReducer(state, stale), state);
  assert.equal(demoReducer(state, { type: "advance", run: state.run, from: "flip" }), state);
});

test("reset works from every demo stage and scheduled work can be cancelled", () => {
  for (const stage of Object.keys(demoFrames) as Array<keyof typeof demoFrames>) {
    assert.deepEqual(demoReducer({ stage, run: 4 }, { type: "reset" }), { stage: "idle", run: 5 });
  }
  let cancelled = false;
  let queued: (() => void) | undefined;
  const actions: DemoAction[] = [];
  const cancel = scheduleDemoStep({ stage: "claim", run: 8 }, (action) => actions.push(action), {
    after(callback, delay) { assert.equal(delay, 1200); queued = callback; return () => { cancelled = true; }; },
  });
  cancel();
  assert.ok(cancelled);
  assert.deepEqual(actions, []);
  // Even a callback already queued by the browser carries its old run identity.
  queued?.();
  assert.deepEqual(actions, [{ type: "advance", run: 8, from: "claim" }]);
});

test("tutorial next/back are bounded and reopening resets to step one", () => {
  let step: TutorialStep = 0;
  assert.equal(tutorialReducer(step, "back"), 0);
  for (let i = 0; i < 12; i++) step = tutorialReducer(step, "next");
  assert.equal(step, 9);
  assert.equal(tutorialReducer(step, "back"), 8);
  assert.equal(tutorialReducer(step, "reset"), 0);
});

test("tutorial step three requires one -2 selection, enables Next, advances, and resets cleanly", () => {
  let state: TutorialState = { ...INITIAL_TUTORIAL_STATE, step: 2 };
  assert.equal(tutorialCanContinue(state), false, "Next starts disabled on PLAY A REAL CARD");
  assert.equal(tutorialStateReducer(state, { type: "next" }), state, "a disabled scripted step cannot advance");

  state = tutorialStateReducer(state, { type: "selectReal", card: "SKIP" });
  assert.equal(tutorialCanContinue(state), false, "a different real card does not satisfy the -2 lesson");

  state = tutorialStateReducer(state, { type: "selectReal", card: "-2" });
  assert.equal(tutorialCanContinue(state), true, "selecting -2 enables Next immediately");
  state = tutorialStateReducer(state, { type: "next" });
  assert.equal(state.step, 3, "one Next action advances to MAKE YOUR CLAIM");

  state = tutorialStateReducer(state, { type: "selectClaim", card: "+2" });
  state = tutorialStateReducer(state, { type: "reset" });
  assert.deepEqual(state, INITIAL_TUTORIAL_STATE, "restart clears step, real card, and claim");
});

test("idle and completed demos never schedule more work", () => {
  for (const stage of ["idle", "complete"] as const) {
    const cancel = scheduleDemoStep({ stage, run: 2 }, () => assert.fail("Unexpected dispatch"), {
      after() { assert.fail("Unexpected timer"); },
    });
    cancel();
  }
});

test("inspection selects only one card and exposes a native pressed control", () => {
  assert.equal(inspectCard(null, "a"), "a");
  assert.equal(inspectCard("a", "b"), "b");
  assert.equal(inspectCard("b", "b"), null);
  const html = renderToStaticMarkup(<SecretCard rule="PUBLIC EXAMPLE" ownerLabel="YOU" onInspect={() => {}} inspected example />);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Inspect YOU&#x27;s example card/);
  assert.equal((html.match(/<button /g) ?? []).length, 1);
});

test("private effect knowledge selects the latest authorized result and dismissal is local", () => {
  const inspectedPlayerId = randomUUID();
  const inspectionId = randomUUID();
  const inspection = latestPrivateEffect({
    inspections: [{ knowledgeId: inspectionId, targetPlayerId: inspectedPlayerId, card: "PLUS_TWO", inspectedAt: 20 }],
    cardTransfers: [],
  });
  assert.deepEqual(inspection, { kind: "inspect", id: inspectionId, playerId: inspectedPlayerId, card: "PLUS_TWO" });
  assert.equal(privateEffectIsVisible(inspection, null), true);
  assert.equal(privateEffectIsVisible(inspection, inspectionId), false, "GOT IT dismisses that knowledge result only");

  const transferId = randomUUID();
  const transfer = latestPrivateEffect({
    inspections: [{ knowledgeId: inspectionId, targetPlayerId: inspectedPlayerId, card: "PLUS_TWO", inspectedAt: 20 }],
    cardTransfers: [{ knowledgeId: transferId, sourcePlayerId: inspectedPlayerId, card: "SKIP", receivedAt: 21 }],
  });
  assert.deepEqual(transfer, { kind: "steal", id: transferId, playerId: inspectedPlayerId, card: "SKIP" });
});

test("public effect feedback names consequential state without exposing private card knowledge", () => {
  assert.equal(publicEffectLabel("skip"), "SKIP ARMED");
  assert.equal(publicEffectLabel("reverse"), "DIRECTION REVERSED");
  assert.equal(publicEffectLabel("shield"), "SHIELD ARMED");
  assert.equal(publicEffectLabel("shield_blocked"), "SHIELD BLOCKED IT");
  assert.equal(publicEffectLabel("inspect"), "INSPECTION COMPLETE");
  assert.equal(publicEffectLabel("steal"), "A CARD WAS STOLEN");
  assert.equal(publicEffectLabel("movement"), "BUTTON MOVED");
});

test("preference hydration never overwrites saved preferences with defaults", () => {
  const saved = { ...DEFAULT_PREFERENCES, masterEnabled: true, masterVolume: 0.25, motion: "reduced" as const };
  const values = new Map([[PREFERENCES_KEY, JSON.stringify(saved)]]);
  let writes = 0;
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { writes++; values.set(key, value); } };
  const store = createPreferenceStore();
  store.hydrate(storage);
  assert.equal(writes, 0);
  assert.deepEqual(store.getSnapshot().preferences, saved);
  assert.ok(store.update({ uiEnabled: false, uiVolume: 0.15 }));
  const reloaded = createPreferenceStore();
  reloaded.hydrate(storage);
  assert.equal(reloaded.getSnapshot().preferences.uiEnabled, false);
  assert.equal(reloaded.getSnapshot().preferences.uiVolume, 0.15);
  assert.equal(values.size, 1);
  assert.equal(store.update({ masterVolume: 2 }), false);
});

test("malformed, old, oversized, and unexpected saved settings fail safely", () => {
  for (const raw of [null, "bad json", "{}", "x".repeat(2048), JSON.stringify({ ...DEFAULT_PREFERENCES, version: 2 }), JSON.stringify({ ...DEFAULT_PREFERENCES, score: 100 }), JSON.stringify({ ...DEFAULT_PREFERENCES, masterVolume: -1 })]) {
    assert.deepEqual(parsePreferences(raw), DEFAULT_PREFERENCES);
  }
});

test("blocked storage still permits local preference changes and subscriptions clean up", () => {
  const store = createPreferenceStore();
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  store.hydrate({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  assert.equal(store.getSnapshot().persistence, "unavailable");
  assert.ok(store.update({ motion: "reduced" }));
  assert.equal(store.getSnapshot().preferences.motion, "reduced");
  assert.equal(changes, 2);
  unsubscribe();
  store.update({ motion: "full" });
  assert.equal(changes, 2);
});

test("device reduced motion wins even when the saved preference is Full", () => {
  assert.equal(isMotionReduced("full", false), false);
  assert.equal(isMotionReduced("full", true), true);
  assert.equal(isMotionReduced("reduced", false), true);
  assert.equal(isMotionReduced("reduced", true), true);
});

test("a storage write failure preserves working in-memory volume controls", () => {
  const store = createPreferenceStore();
  store.hydrate({ getItem() { return null; }, setItem() { throw new Error("Quota exceeded"); } });
  assert.equal(store.getSnapshot().persistence, "available");
  assert.ok(store.update({ masterEnabled: true, masterVolume: 0.7, uiVolume: 0.25 }));
  assert.equal(store.getSnapshot().persistence, "unavailable");
  assert.equal(store.getSnapshot().preferences.masterVolume, 0.7);
  assert.equal(store.getSnapshot().preferences.uiVolume, 0.25);
  assert.ok(store.getSnapshot().preferences.masterEnabled);
});

test("sound hooks respect master mute, UI mute, volumes and lifecycle", () => {
  let preferences: Readonly<Preferences> = DEFAULT_PREFERENCES;
  const played: Array<{ event: SoundEvent; gain: number }> = [];
  let unlocked = 0;
  let stopped = 0;
  let disposed = 0;
  const sound = createSoundController(() => preferences, { unlock() { unlocked++; }, play(event, gain) { played.push({ event, gain }); }, stop() { stopped++; }, dispose() { disposed++; } });
  for (const event of Object.keys(soundEvents) as SoundEvent[]) sound.play(event);
  sound.unlock();
  assert.equal(played.length, 0);
  assert.equal(unlocked, 0);
  preferences = { ...DEFAULT_PREFERENCES, masterEnabled: true, masterVolume: 0.5, uiVolume: 0.4 };
  sound.unlock();
  sound.play("uiClick");
  sound.play("buttonPress");
  assert.deepEqual(played, [{ event: "uiClick", gain: 0.2 }, { event: "buttonPress", gain: 0.5 }]);
  assert.equal(unlocked, 1);
  assert.equal(soundGain("cardFlip", { ...preferences, uiEnabled: false }), 0);
  assert.equal(soundGain("unexpectedCounter", { ...preferences, uiEnabled: false }), 0.5);
  assert.equal(soundGain("buttonPress", { ...preferences, masterVolume: 0 }), 0);
  sound.stop(); sound.dispose();
  assert.equal(stopped, 1); assert.equal(disposed, 1);
});

test("authoritative local turn transitions notify once and never notify another player", () => {
  const localPlayerId = "00000000-0000-4000-8000-000000000001";
  const otherPlayerId = "00000000-0000-4000-8000-000000000002";
  assert.equal(shouldNotifyLocalTurn(null, "round:local:100", localPlayerId, localPlayerId), true);
  assert.equal(shouldNotifyLocalTurn("round:local:100", "round:local:100", localPlayerId, localPlayerId), false);
  assert.equal(shouldNotifyLocalTurn("round:other:90", "round:other:100", otherPlayerId, localPlayerId), false);
  assert.equal(shouldNotifyLocalTurn("round:other:100", "round:local:200", localPlayerId, localPlayerId), true);
  assert.ok("yourTurn" in soundEvents);
});

test("public event sound processing ignores initial snapshots and returns only unseen events", () => {
  const first = { eventId: "00000000-0000-4000-8000-000000000001", type: "TURN_STARTED", at: 1, actorPlayerId: null, targetPlayerId: null, claim: null, revealedCard: null, movement: null } as const;
  const second = { ...first, eventId: "00000000-0000-4000-8000-000000000002", type: "CARD_PLAYED" as const, at: 2 };
  assert.deepEqual(eventsAfter([first, second], first.eventId), [second]);
  assert.deepEqual(eventsAfter([first, second], null), []);
  assert.deepEqual(eventsAfter([first, second], "00000000-0000-4000-8000-999999999999"), []);
});

test("the logo easter egg stops counting after its one reveal", () => {
  let count = 0;
  for (let i = 0; i < 20; i++) count = logoClickCount(count);
  assert.equal(count, 5);
});
