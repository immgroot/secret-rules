import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BUTTON_DECK_PRESETS, CHALLENGE_TIMER_PRESETS, CreateRoomSchema, DisplayNameSchema, RoomCodeSchema, RoomSettingsSchema,
  PrivatePlayerRoundStateSchema, PublicRoomSnapshotSchema, DEFAULT_ROOM_SETTINGS, SessionGrantSchema, SessionResultSchema, TURN_TIMER_PRESETS,
  effectiveDeckSize, minimumCustomDeckSize, recommendedButtonTarget,
} from "@secret-rules/shared";
import { newerPrivateState, newerSnapshot } from "../src/multiplayer/state.ts";
import { readRoomSession, saveRoomSession, ROOM_SESSION_KEY } from "../src/multiplayer/session.ts";
import { readMutes, saveMutes } from "../src/multiplayer/mute.ts";
import { observeActivity } from "../src/multiplayer/activity.ts";

const roomId = randomUUID();
const playerId = randomUUID();
const state = PublicRoomSnapshotSchema.parse({
  roomId, roomCode: "K7F2Q", hostPlayerId: playerId, status: "lobby",
  roomName: "SECRET ROOM", visibility: "private", locked: false, passwordRequired: false, chatMessages: [], publicRound: null,
  players: [{ playerId, displayName: "Tester", avatarId: "lime", playerColor: "lime", role: "player", afk: false, ready: false, connected: true, isHost: true, joinedAt: 10 }],
  settings: DEFAULT_ROOM_SETTINGS, createdAt: 10, stateVersion: 1,
});

test("personal mute is local, scoped by room and viewer, bounded, and expires safely", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const other = randomUUID();
  saveMutes(storage, roomId, playerId, [other, other, playerId], 1000);
  assert.deepEqual(readMutes(storage, roomId, playerId, 1001), [other]);
  assert.deepEqual(readMutes(storage, roomId, other, 1001), []);
  assert.deepEqual(readMutes(storage, randomUUID(), playerId, 1001), []);
  assert.deepEqual(readMutes(storage, roomId, playerId, 1000 + 7 * 24 * 60 * 60 * 1000), []);
  assert.deepEqual(readMutes(null, roomId, playerId), []);
  saveMutes(null, roomId, playerId, [other]);
  for (let i = 0; i < 25; i++) saveMutes(storage, randomUUID(), playerId, [other], 1000);
  assert.equal(JSON.parse([...values.values()][0]!).length, 20);
});

test("AFK hints follow meaningful interactions, throttle bursts, and stop on cleanup", () => {
  let now = 1000;
  let hints = 0;
  const target = new EventTarget();
  const stop = observeActivity(target, () => { hints++; }, () => now);
  target.dispatchEvent(new Event("mousemove"));
  target.dispatchEvent(new Event("pointerover"));
  assert.equal(hints, 0);
  target.dispatchEvent(new Event("keydown"));
  target.dispatchEvent(new Event("pointerdown"));
  assert.equal(hints, 1);
  now += 15_000;
  target.dispatchEvent(new Event("input"));
  assert.equal(hints, 2);
  stop(); now += 15_000;
  target.dispatchEvent(new Event("keydown"));
  assert.equal(hints, 2);
});

test("session acknowledgments must match the authorized room and connected player", () => {
  const session = { roomId, playerId, roomCode: "K7F2Q", token: "a".repeat(43) };
  assert.ok(SessionResultSchema.safeParse({ ok: true, state, session }).success);
  for (const change of [{ roomId: randomUUID() }, { playerId: randomUUID() }, { roomCode: "ABCDE" }]) {
    assert.equal(SessionResultSchema.safeParse({ ok: true, state, session: { ...session, ...change } }).success, false);
  }
});

test("room snapshots reject stale versions, foreign rooms and missing membership", () => {
  const current = { ...state, stateVersion: 7 };
  assert.equal(newerSnapshot(current, state, roomId, playerId), current);
  assert.equal(newerSnapshot(current, { ...state, stateVersion: 7 }, roomId, playerId), current);
  const newer = { ...state, stateVersion: 8 };
  assert.equal(newerSnapshot(current, newer, roomId, playerId), newer);
  assert.equal(newerSnapshot(current, { ...newer, roomId: randomUUID() }, roomId, playerId), current);
  assert.equal(newerSnapshot(null, newer, roomId, randomUUID()), null);
});

test("private round deliveries reject stale revisions, foreign recipients and foreign rounds", () => {
  const roundId = randomUUID();
  const current = PrivatePlayerRoundStateSchema.parse({
    roundId, roundNumber: 1, miniGameId: "the-button-v2", playerId, revision: 7, hand: [],
    secretRule: {
      id: randomUUID(), templateId: "BUTTON_V2_BLUFF_SUCCESS", identity: `BUTTON_V2_BLUFF_SUCCESS:${playerId}`,
      miniGameId: "the-button-v2", category: "personal", rarity: "common", difficulty: "medium",
      parameters: { actionCount: 3 }, conflictTags: [], compatibilityTags: [], incompatibilityTags: [],
      description: "SUCCESSFULLY BLUFF 3 TIMES.", shortDescription: "BLUFF 3 TIMES.", progressType: "counter",
      rewardWeight: 1, visibility: "private", evaluatorId: "rule:button-v2-bluff-success",
    },
    privateProgress: { status: "in_progress", current: 0, target: 3, summary: "0 / 3" },
    privateTargetPlayerId: null, acknowledgedAt: null, inspections: [], pendingChoice: null,
  });
  assert.equal(newerPrivateState(current, { ...current, revision: 6 }, playerId, roundId), current);
  assert.equal(newerPrivateState(current, { ...current, revision: 7 }, playerId, roundId), current);
  const newer = { ...current, revision: 8 };
  assert.equal(newerPrivateState(current, newer, playerId, roundId), newer);
  assert.equal(newerPrivateState(current, { ...newer, playerId: randomUUID() }, playerId, roundId), current);
  assert.equal(newerPrivateState(current, { ...newer, roundId: randomUUID() }, playerId, roundId), current);
});

test("room credentials survive refresh in one tab, contain no profile, and clear on leave", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const session = SessionGrantSchema.parse({ roomId, roomCode: "K7F2Q", playerId, token: "a".repeat(43) });
  assert.ok(saveRoomSession(storage, session));
  assert.deepEqual(readRoomSession(storage), session);
  assert.deepEqual([...values.keys()], [ROOM_SESSION_KEY]);
  assert.equal(/displayName|ready|settings|socketId/.test(values.get(ROOM_SESSION_KEY) ?? ""), false);
  assert.ok(saveRoomSession(storage, null));
  assert.equal(readRoomSession(storage), null);
});

test("invalid or blocked session storage fails safely", () => {
  for (const raw of ["bad", "{}", "x".repeat(2049), JSON.stringify({ version: 1, session: { token: "bad" } })]) {
    assert.equal(readRoomSession({ getItem: () => raw, setItem() {}, removeItem() {} }), null);
  }
  const blocked = { getItem(): never { throw new Error("blocked"); }, setItem(): never { throw new Error("blocked"); }, removeItem(): never { throw new Error("blocked"); } };
  assert.equal(readRoomSession(blocked), null);
  assert.equal(saveRoomSession(blocked, null), false);
});

test("shared payload validation normalizes names/codes and rejects client authority", () => {
  assert.equal(RoomCodeSchema.parse(" k7f2q "), "K7F2Q");
  assert.equal(DisplayNameSchema.parse("  Ada  Lovelace  "), "Ada Lovelace");
  assert.equal(RoomCodeSchema.safeParse("O0I1L").success, false);
  assert.equal(DisplayNameSchema.safeParse("<script>").success, false);
  assert.equal(CreateRoomSchema.safeParse({ requestId: randomUUID(), displayName: "Ada", avatarId: "lime", isHost: true }).success, false);
  assert.equal(RoomSettingsSchema.safeParse({ ...DEFAULT_ROOM_SETTINGS, maxPlayers: 11 }).success, false);
  assert.equal(RoomSettingsSchema.safeParse({ ...DEFAULT_ROOM_SETTINGS, roundCount: 4 }).success, false);
  assert.equal(PublicRoomSnapshotSchema.safeParse({ ...state, credential: "nope" }).success, false);
});

test("Button V2 settings default safely, scale decks and validate target and timer bounds", () => {
  const legacySettings = { maxPlayers: 10, roundCount: 7, chaos: "normal" };
  assert.deepEqual(RoomSettingsSchema.parse(legacySettings), { ...legacySettings, buttonDeckPreset: "standard", buttonCustomDeckSize: 50, buttonTarget: null, turnTimerSeconds: 15, challengeTimerSeconds: 10 });
  assert.deepEqual(BUTTON_DECK_PRESETS, ["quick", "standard", "long", "epic", "custom"]);
  assert.deepEqual(TURN_TIMER_PRESETS, [10, 15, 20, 30]);
  assert.deepEqual(CHALLENGE_TIMER_PRESETS, [5, 10, 15, 20]);
  assert.equal(effectiveDeckSize("standard", 4, 50), 50);
  assert.equal(effectiveDeckSize("standard", 10, 50), 100);
  assert.equal(minimumCustomDeckSize(10), 60);
  assert.equal(recommendedButtonTarget("standard", 4, 50), 30);
  for (const settings of [
    { buttonTarget: 9 }, { buttonTarget: 201 }, { buttonCustomDeckSize: 29 }, { buttonCustomDeckSize: 201 },
    { turnTimerSeconds: 4 }, { turnTimerSeconds: 61 }, { challengeTimerSeconds: 2 }, { challengeTimerSeconds: 31 },
  ]) assert.equal(RoomSettingsSchema.safeParse({ ...DEFAULT_ROOM_SETTINGS, ...settings }).success, false);
});
