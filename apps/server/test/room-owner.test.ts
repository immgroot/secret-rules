import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DEFAULT_ROOM_SETTINGS, MAX_SPECTATORS, PublicRoomSnapshotSchema, type SessionGrant } from "@secret-rules/shared";
import { RoomOwner, mayReceivePrivatePlayerState } from "../src/rooms/room-owner.ts";
import { RoomPasswords } from "../src/rooms/passwords.ts";
import { RateLimiter } from "../src/realtime/rate-limiter.ts";

const person = (displayName: string) => ({ requestId: randomUUID(), displayName, avatarId: "lime" as const });
const credential = ({ roomId, playerId, token }: SessionGrant) => ({ roomId, playerId, token });

test("host expiry without a connected successor waits for resume; final expiry destroys room", () => {
  let now = 1000;
  const owner = new RoomOwner({ now: () => now, graceMs: 100 });
  const host = owner.create("host", person("Host"));
  const guest = owner.join("guest", { ...person("Guest"), roomCode: host.state.roomCode });
  owner.disconnect("host");
  now = 1050;
  owner.disconnect("guest");
  now = 1101;
  owner.sweep();
  assert.equal(owner.roomCount, 1);
  assert.throws(() => owner.resume("expired", credential(host.session)), { message: "INVALID_SESSION" });
  const resumed = owner.resume("new-guest-socket", credential(guest.session));
  assert.equal(resumed.state.players.length, 1);
  assert.equal(resumed.state.hostPlayerId, guest.session.playerId);
  assert.equal(resumed.state.players[0]?.isHost, true);
  owner.disconnect("new-guest-socket");
  now = 1201;
  owner.sweep();
  assert.equal(owner.roomCount, 0);
  assert.throws(() => owner.join("other", { ...person("Other"), roomCode: host.state.roomCode }), { message: "ROOM_NOT_FOUND" });
});

test("no-op changes and resync do not advance versions or defeat idle expiration", () => {
  let now = 1000;
  const owner = new RoomOwner({ now: () => now, idleMs: 100 });
  const host = owner.create("host", person("Host"));
  now = 1050;
  const same = owner.setReady("host", { roomId: host.state.roomId, requestId: randomUUID(), ready: false });
  assert.equal(same.state.stateVersion, 1);
  const settings = owner.updateSettings("host", { roomId: host.state.roomId, requestId: randomUUID(), settings: { ...DEFAULT_ROOM_SETTINGS } });
  assert.equal(settings.state.stateVersion, 1);
  now = 1099;
  assert.equal(owner.requestState("host", host.state.roomId).state.stateVersion, 1);
  now = 1100;
  owner.sweep();
  assert.equal(owner.roomCount, 0);
});

test("room count is bounded and a destroyed room releases capacity", () => {
  const owner = new RoomOwner({ maxRooms: 1 });
  const host = owner.create("host", person("Host"));
  assert.throws(() => owner.create("other", person("Other")), { message: "SERVER_BUSY" });
  owner.leave("host", host.state.roomId);
  assert.equal(owner.create("other", person("Other")).state.players.length, 1);
  owner.dispose();
  assert.equal(owner.roomCount, 0);
});

test("rate limits expire, bound retained keys, and clear on shutdown", () => {
  let now = 1000;
  const limiter = new RateLimiter(() => now);
  assert.ok(limiter.take("action", 2, 100));
  assert.ok(limiter.take("action", 2, 100));
  assert.equal(limiter.take("action", 2, 100), false);
  now = 1100;
  assert.ok(limiter.take("action", 2, 100));
  for (let i = 0; i < 4999; i++) assert.ok(limiter.take(`key:${i}`, 1, 100));
  assert.equal(limiter.take("overflow", 1, 100), false);
  now = 1200;
  limiter.sweep();
  assert.ok(limiter.take("overflow", 1, 100));
  limiter.clear();
  assert.ok(limiter.take("overflow", 1, 100));
});

test("chat and private reports are bounded, rate limited across reconnect, and destroyed with room", () => {
  let now = 1000;
  const owner = new RoomOwner({ now: () => now });
  const host = owner.create("host", person("Host"));
  const guests = Array.from({ length: 4 }, (_, i) => owner.join(`guest${i}`, { ...person(`Guest ${i}`), roomCode: host.state.roomCode }));
  const command = () => ({ requestId: randomUUID(), roomId: host.state.roomId });
  for (let i = 0; i < 60; i++) { now += 10_001; owner.sendChat("host", { ...command(), text: `Message ${i}` }); }
  const state = owner.requestState("host", host.state.roomId).state;
  assert.equal(state.chatMessages.length, 50);
  assert.equal(state.chatMessages[0]?.text, "Message 10");
  for (const target of guests.slice(0, 3)) owner.reportPlayer("host", { ...command(), targetPlayerId: target.session.playerId, reason: "spam", description: "Test report" });
  assert.equal(owner.reportCount, 3);
  assert.throws(() => owner.reportPlayer("host", { ...command(), targetPlayerId: guests[3]!.session.playerId, reason: "spam", description: "" }), { message: "RATE_LIMITED" });
  owner.disconnect("host"); owner.resume("host2", credential(host.session));
  assert.throws(() => owner.reportPlayer("host2", { ...command(), targetPlayerId: guests[0]!.session.playerId, reason: "spam", description: "" }), { message: "REPORT_ALREADY_SENT" });
  assert.equal(JSON.stringify(owner.requestState("host2", host.state.roomId)).includes("Test report"), false);
  now += 600_001;
  owner.reportPlayer("host2", { ...command(), targetPlayerId: guests[3]!.session.playerId, reason: "other", description: "" });
  for (let i = 0; i < 4; i++) owner.leave(`guest${i}`, host.state.roomId);
  owner.leave("host2", host.state.roomId);
  assert.equal(owner.reportCount, 0);
  assert.equal(owner.roomCount, 0);
});

test("spectator capacity is separate and private projections deny spectators, strangers and disconnected players", () => {
  const owner = new RoomOwner();
  const host = owner.create("host", person("Host"));
  const spectators = Array.from({ length: MAX_SPECTATORS }, (_, i) => owner.join(`spec${i}`, { ...person(`Viewer ${i}`), roomCode: host.state.roomCode, role: "spectator" }));
  assert.throws(() => owner.join("extra", { ...person("Extra"), roomCode: host.state.roomCode, role: "spectator" }), { message: "SPECTATORS_FULL" });
  const active = host.state.players[0]!;
  const spec = spectators[0]!.state.players.find((p) => p.role === "spectator")!;
  assert.equal(mayReceivePrivatePlayerState(active, active.playerId), true);
  assert.equal(mayReceivePrivatePlayerState(active, spec.playerId), false);
  assert.equal(mayReceivePrivatePlayerState(spec, spec.playerId), false);
  assert.equal(mayReceivePrivatePlayerState({ ...active, connected: false }, active.playerId), false);
  assert.equal(PublicRoomSnapshotSchema.safeParse({ ...spectators[0]!.state, privatePlayerState: { secret: "not allowed" } }).success, false);
  owner.leave("host", host.state.roomId);
  assert.equal(owner.requestState("spec0", host.state.roomId).state.hostPlayerId, null);
  const promoted = owner.setRole("spec0", { requestId: randomUUID(), roomId: host.state.roomId, role: "player" });
  assert.equal(promoted.state.hostPlayerId, spec.playerId);
  assert.equal(promoted.state.players.filter((p) => p.isHost).length, 1);
  owner.dispose();
});

test("password commits and join admission recheck current security and host after asynchronous preparation", () => {
  const owner = new RoomOwner();
  const host = owner.create("host", person("Host"));
  const guest = owner.join("guest", { ...person("Guest"), roomCode: host.state.roomCode });
  const command = () => ({ requestId: randomUUID(), roomId: host.state.roomId });
  const join = { ...person("Visitor"), roomCode: host.state.roomCode, password: "safe-test-password" };
  const digest = { salt: Buffer.alloc(16, 1), hash: Buffer.alloc(32, 2) }; // Prepared digest seam, not a transport payload.
  const initialRevision = owner.passwordRevision("host", host.state.roomId);
  owner.setPassword("host", { ...command(), enabled: true, password: "safe-test-password" }, digest, initialRevision);
  const challenge = owner.joinChallenge("visitor", join);
  owner.setPassword("host", { ...command(), enabled: false }, null, initialRevision + 1);
  assert.throws(() => owner.join("visitor", join, { roomId: challenge.roomId, version: challenge.version }), { message: "SECURITY_CHANGED" });
  const beforeTransfer = owner.passwordRevision("host", host.state.roomId);
  owner.transferHost("host", { ...command(), targetPlayerId: guest.session.playerId });
  assert.throws(() => owner.setPassword("host", { ...command(), enabled: true, password: "safe-test-password" }, digest, beforeTransfer), { message: "NOT_HOST" });
  const beforeLock = owner.joinChallenge("visitor", join);
  owner.setLock("guest", { ...command(), locked: true });
  assert.throws(() => owner.join("visitor", join, { roomId: beforeLock.roomId, version: beforeLock.version }), { message: "ROOM_LOCKED" });
  owner.dispose();
});

test("password hashing salts each digest, verifies exactly, and bounds concurrent crypto", async () => {
  const passwords = new RoomPasswords();
  const first = passwords.hash("safe-test-password");
  const second = passwords.hash("safe-test-password");
  await assert.rejects(passwords.hash("third-password"), { message: "SERVER_BUSY" });
  const [a, b] = await Promise.all([first, second]);
  assert.notDeepEqual(a.salt, b.salt);
  assert.notDeepEqual(a.hash, b.hash);
  assert.equal(await passwords.verify("safe-test-password", a), true);
  assert.equal(await passwords.verify("wrong-password", a), false);
  passwords.close();
  await assert.rejects(passwords.hash("safe-test-password"), { message: "SERVER_BUSY" });
});
