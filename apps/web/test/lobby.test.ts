import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BUTTON_ROUND_DURATION_PRESETS, CreateRoomSchema, DisplayNameSchema, RoomCodeSchema, RoomSettingsSchema,
  PublicRoomSnapshotSchema, DEFAULT_ROOM_SETTINGS, SessionGrantSchema, SessionResultSchema,
} from "@secret-rules/shared";
import { newerSnapshot } from "../src/multiplayer/state.ts";
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

test("Button round duration defaults to 80 seconds and accepts only whole seconds from 30 through 300", () => {
  const legacySettings = { maxPlayers: 10, roundCount: 7, chaos: "normal" };
  assert.equal(RoomSettingsSchema.parse(legacySettings).buttonRoundDurationSeconds, 80);
  assert.deepEqual(BUTTON_ROUND_DURATION_PRESETS, [60, 80, 120, 180]);
  for (const seconds of [30, ...BUTTON_ROUND_DURATION_PRESETS, 45, 300]) {
    assert.equal(RoomSettingsSchema.safeParse({ ...DEFAULT_ROOM_SETTINGS, buttonRoundDurationSeconds: seconds }).success, true);
  }
  for (const seconds of [29, 30.5, 301, Number.NaN, Infinity]) {
    assert.equal(RoomSettingsSchema.safeParse({ ...DEFAULT_ROOM_SETTINGS, buttonRoundDurationSeconds: seconds }).success, false);
  }
});
