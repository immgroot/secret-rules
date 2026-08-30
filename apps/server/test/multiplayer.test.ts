import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { io, type Socket } from "socket.io-client";
import type { z } from "zod";
import {
  DEFAULT_ROOM_SETTINGS, EVENTS, PROTOCOL_VERSION, PublicRoomSnapshotSchema, PrivateRoundDeliverySchema, SessionResultSchema, StateResultSchema,
  LeaveResultSchema, ServerErrorSchema, type PrivatePlayerRoundState, type PublicRoomSnapshot, type ServerToClientEvents,
  type ServerError, type SessionResult,
} from "@secret-rules/shared";
import { createGameServer } from "../src/server.ts";
import type { RealtimeOptions } from "../src/realtime/transport.ts";

const ORIGIN = "http://localhost:3000";
// Tests deliberately send unknown payloads to exercise runtime validation.
type ProbeSocket = Socket<ServerToClientEvents, Record<string, (payload: unknown, reply: (raw: unknown) => void) => void>>;
type Peer = { socket: ProbeSocket; states: PublicRoomSnapshot[]; privateStates: (PrivatePlayerRoundState | null)[]; ended: ServerError[] };
const request = () => ({ requestId: randomUUID() });
const person = (displayName: string) => ({ ...request(), displayName, avatarId: "lime" });
const command = (roomId: string) => ({ ...request(), roomId });

async function eventually(predicate: () => boolean, message = "Clients did not converge") {
  const deadline = Date.now() + 2500;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), message);
}
function call<T>(peer: Peer, event: string, payload: unknown, schema: z.ZodType<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No acknowledgment for ${event}`)), 2000);
    peer.socket.emit(event, payload, (raw) => {
      clearTimeout(timeout);
      try { resolve(schema.parse(raw)); } catch (error) { reject(error); }
    });
  });
}
function success(result: SessionResult) { assert.ok(result.ok, result.ok ? "" : result.error.code); return result; }

async function setup(context: TestContext, options: Partial<RealtimeOptions> = {}) {
  const server = createGameServer({ allowedOrigins: [ORIGIN], ...options });
  const peers: Peer[] = [];
  context.after(async () => { for (const peer of peers) peer.socket.close(); await server.close(); });
  server.httpServer.listen(0, "127.0.0.1");
  await once(server.httpServer, "listening");
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  async function connect(options: { origin?: string; auth?: unknown; transports?: string[] } = {}): Promise<Peer> {
    const socket: ProbeSocket = io(url, {
      autoConnect: false, forceNew: true, reconnection: false,
      transports: options.transports ?? ["websocket"],
      extraHeaders: { Origin: options.origin ?? ORIGIN },
      auth: options.auth ?? { protocolVersion: PROTOCOL_VERSION },
    });
    const peer: Peer = { socket, states: [], privateStates: [], ended: [] };
    peers.push(peer);
    socket.on(EVENTS.update, (raw) => peer.states.push(PublicRoomSnapshotSchema.parse(raw)));
    socket.on(EVENTS.privateState, (raw) => peer.privateStates.push(PrivateRoundDeliverySchema.parse(raw).state));
    socket.on(EVENTS.ended, (raw) => peer.ended.push(ServerErrorSchema.parse(raw)));
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    return peer;
  }
  return { server, connect, url };
}

test("four real clients synchronize players, ready, settings, disconnect and stable reconnect", async (context) => {
  const { connect } = await setup(context);
  const [a, b, c, d] = await Promise.all([connect(), connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Aster"), SessionResultSchema));
  const join = async (peer: Peer, name: string) => success(await call(peer, EVENTS.join, { ...person(name), roomCode: ` ${host.state.roomCode.toLowerCase()} ` }, SessionResultSchema));
  const bSession = await join(b, "Birch");
  const cSession = await join(c, "Cedar");
  await join(d, "Dune");
  await eventually(() => [a, b, c, d].every((peer) => peer.states.at(-1)?.players.length === 4));
  for (const peer of [b, c, d]) assert.deepEqual(peer.states.at(-1), a.states.at(-1));
  const roomId = host.state.roomId;
  assert.ok((await call(b, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  await eventually(() => [a, b, c, d].every((peer) => peer.states.at(-1)?.players.find((p) => p.playerId === bSession.session.playerId)?.ready === true));
  assert.ok((await call(c, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  assert.ok((await call(a, EVENTS.settings, { ...command(roomId), settings: { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 10, roundCount: 7, chaos: "chaos" } }, StateResultSchema)).ok);
  await eventually(() => [a, b, c, d].every((peer) => peer.states.at(-1)?.settings.roundCount === 7));
  c.socket.disconnect();
  await eventually(() => [a, b, d].every((peer) => peer.states.at(-1)?.players.find((p) => p.playerId === cSession.session.playerId)?.connected === false));
  const restored = await connect();
  const credential = { roomId, playerId: cSession.session.playerId, token: cSession.session.token };
  const resumed = success(await call(restored, EVENTS.resume, { ...request(), credential }, SessionResultSchema));
  assert.equal(resumed.session.playerId, cSession.session.playerId);
  assert.equal(resumed.state.settings.roundCount, 7);
  assert.equal(resumed.state.players.find((p) => p.playerId === resumed.session.playerId)?.ready, true);
  await eventually(() => [a, b, d, restored].every((peer) => peer.states.at(-1)?.players.every((p) => p.connected)));
  for (const peer of [a, b, d, restored]) {
    const snapshot = await call(peer, EVENTS.requestState, command(roomId), StateResultSchema);
    assert.ok(snapshot.ok);
    assert.deepEqual(snapshot.state, resumed.state);
    const wire = JSON.stringify(peer.states);
    assert.equal(/token|credentialHash|socketId|requests/.test(wire), false);
    assert.equal(wire.includes(host.session.token), false);
    assert.equal(wire.includes(cSession.session.token), false);
  }
});

test("validation, authorization, capacity, names and private session boundaries", async (context) => {
  const { connect } = await setup(context);
  const [a, b, outsider] = await Promise.all([connect(), connect(), connect()]);
  for (const displayName of ["", " ", "x", "<img src=x onerror=alert(1)>", "Name\u202e", "a".repeat(21)]) {
    const result = await call(a, EVENTS.create, person(displayName), SessionResultSchema);
    assert.ok(!result.ok); assert.equal(result.error.code, "INVALID_DISPLAY_NAME");
  }
  const forged = await call(a, EVENTS.create, { ...person("Host"), isHost: true }, SessionResultSchema);
  assert.ok(!forged.ok); assert.equal(forged.error.code, "INVALID_PAYLOAD");
  const host = success(await call(a, EVENTS.create, person("  Host  "), SessionResultSchema));
  assert.equal(host.state.players[0]?.displayName, "Host");
  const roomId = host.state.roomId;
  const guest = success(await call(b, EVENTS.join, { ...person("Guest"), roomCode: host.state.roomCode }, SessionResultSchema));
  const hostileReady = await call(b, EVENTS.ready, { ...command(roomId), ready: true, playerId: host.session.playerId }, StateResultSchema);
  assert.ok(!hostileReady.ok); assert.equal(hostileReady.error.code, "INVALID_PAYLOAD");
  const settings = { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 4, roundCount: 3 as const, chaos: "normal" as const };
  const nonHost = await call(b, EVENTS.settings, { ...command(roomId), settings }, StateResultSchema);
  assert.ok(!nonHost.ok); assert.equal(nonHost.error.code, "NOT_HOST");
  const unauthorized = await call(outsider, EVENTS.requestState, command(roomId), StateResultSchema);
  assert.ok(!unauthorized.ok); assert.equal(unauthorized.error.code, "INVALID_SESSION");
  assert.equal(outsider.states.length, 0);
  const badCredential = await call(outsider, EVENTS.resume, { ...request(), credential: { roomId, playerId: host.session.playerId, token: guest.session.token } }, SessionResultSchema);
  assert.ok(!badCredential.ok); assert.equal(badCredential.error.code, "INVALID_SESSION");
  const duplicate = await call(outsider, EVENTS.join, { ...person("hOsT"), roomCode: host.state.roomCode }, SessionResultSchema);
  assert.ok(!duplicate.ok); assert.equal(duplicate.error.code, "NAME_TAKEN");
  const badCode = await call(outsider, EVENTS.join, { ...person("Else"), roomCode: "O0I1L" }, SessionResultSchema);
  assert.ok(!badCode.ok); assert.equal(badCode.error.code, "INVALID_ROOM_CODE");
  assert.ok((await call(a, EVENTS.settings, { ...command(roomId), settings }, StateResultSchema)).ok);
  for (const name of ["Third", "Fourth"]) {
    const peer = await connect();
    success(await call(peer, EVENTS.join, { ...person(name), roomCode: host.state.roomCode }, SessionResultSchema));
    if (name === "Fourth") peer.socket.disconnect();
  }
  const full = await call(outsider, EVENTS.join, { ...person("Fifth"), roomCode: host.state.roomCode }, SessionResultSchema);
  assert.ok(!full.ok); assert.equal(full.error.code, "ROOM_FULL");
});

test("temporary host loss keeps host, expiry transfers in join order, explicit leave revokes and empties room", async (context) => {
  const { connect, server } = await setup(context, { graceMs: 300, sweepMs: 10 });
  const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const second = success(await call(b, EVENTS.join, { ...person("Second"), roomCode: host.state.roomCode }, SessionResultSchema));
  const third = success(await call(c, EVENTS.join, { ...person("Third"), roomCode: host.state.roomCode }, SessionResultSchema));
  a.socket.disconnect();
  await eventually(() => b.states.at(-1)?.players[0]?.connected === false);
  assert.equal(b.states.at(-1)?.hostPlayerId, host.session.playerId);
  await eventually(() => b.states.at(-1)?.hostPlayerId === second.session.playerId);
  assert.equal(b.states.at(-1)?.players.filter((p) => p.isHost).length, 1);
  assert.ok((await call(b, EVENTS.leave, command(host.state.roomId), LeaveResultSchema)).ok);
  await eventually(() => c.states.at(-1)?.hostPlayerId === third.session.playerId);
  const rejoin = await connect();
  const credential = { roomId: second.session.roomId, playerId: second.session.playerId, token: second.session.token };
  const revoked = await call(rejoin, EVENTS.resume, { ...request(), credential }, SessionResultSchema);
  assert.ok(!revoked.ok); assert.equal(revoked.error.code, "INVALID_SESSION");
  assert.ok((await call(c, EVENTS.leave, command(host.state.roomId), LeaveResultSchema)).ok);
  assert.equal(server.rooms.roomCount, 0);
});

test("simultaneous ready actions converge; duplicates cannot resurrect older state; spam is limited", async (context) => {
  const { connect } = await setup(context);
  const peers = await Promise.all([connect(), connect(), connect(), connect()]);
  const a = peers[0]!;
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  for (const [index, peer] of peers.slice(1).entries()) success(await call(peer, EVENTS.join, { ...person(`Guest ${index}`), roomCode: host.state.roomCode }, SessionResultSchema));
  const roomId = host.state.roomId;
  await Promise.all(peers.map(async (peer) => {
    const first = { ...command(roomId), ready: true };
    for (const payload of [first, { ...command(roomId), ready: false }, first]) assert.ok((await call(peer, EVENTS.ready, payload, StateResultSchema)).ok);
    const conflict = await call(peer, EVENTS.ready, { ...first, ready: false }, StateResultSchema);
    assert.ok(!conflict.ok); assert.equal(conflict.error.code, "REQUEST_CONFLICT");
  }));
  await eventually(() => peers.every((peer) => peer.states.at(-1)?.players.every((p) => !p.ready)));
  const spam = await Promise.all(Array.from({ length: 20 }, (_, i) => call(a, EVENTS.ready, { ...command(roomId), ready: i % 2 === 0 }, StateResultSchema)));
  assert.ok(spam.some((result) => !result.ok && result.error.code === "RATE_LIMITED"));
  const latest = a.states.at(-1);
  await eventually(() => peers.every((peer) => peer.states.at(-1)?.stateVersion === latest?.stateVersion));
  for (const peer of peers) assert.deepEqual(peer.states.at(-1), latest);
});

test("credential takeover revokes the old socket and does not duplicate a player", async (context) => {
  const { connect } = await setup(context);
  const a = await connect();
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const replacement = await connect();
  const credential = { roomId: host.session.roomId, playerId: host.session.playerId, token: host.session.token };
  const resumed = success(await call(replacement, EVENTS.resume, { ...request(), credential }, SessionResultSchema));
  await eventually(() => !a.socket.connected && a.ended.length === 1);
  assert.equal(a.ended[0]?.code, "SESSION_REPLACED");
  assert.equal(resumed.state.players.length, 1);
  assert.equal(resumed.state.hostPlayerId, host.session.playerId);
  assert.ok((await call(replacement, EVENTS.ready, { ...command(host.state.roomId), ready: true }, StateResultSchema)).ok);
  assert.equal(a.states.at(-1)?.players[0]?.ready, false);
});

test("origin and handshake checks protect websocket and polling; idle cleanup closes rooms", async (context) => {
  const { connect, server } = await setup(context, { idleMs: 150, sweepMs: 10 });
  await assert.rejects(connect({ origin: "https://untrusted.example" }));
  await assert.rejects(connect({ origin: "https://untrusted.example", transports: ["polling"] }));
  await assert.rejects(connect({ auth: { protocolVersion: 1, isHost: true } }));
  const a = await connect({ transports: ["polling"] });
  success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  await eventually(() => server.rooms.roomCount === 0 && a.ended[0]?.code === "ROOM_EXPIRED");
});

test("unknown and prototype-named events are rejected without crashing or mutating rooms", async (context) => {
  const { connect, server } = await setup(context);
  const peer = await connect();
  for (const event of ["unknown:event", "toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const result = await call(peer, event, person("Intruder"), StateResultSchema);
    assert.ok(!result.ok); assert.equal(result.error.code, "INVALID_PAYLOAD");
  }
  assert.equal(server.rooms.roomCount, 0);
  const host = success(await call(peer, EVENTS.create, person("Host"), SessionResultSchema));
  assert.equal(host.state.stateVersion, 1);
});

test("entry retries are idempotent and old room commands cannot affect a new membership", async (context) => {
  const { connect, server } = await setup(context);
  const [a, b] = await Promise.all([connect(), connect()]);
  const create = person("Host");
  const host = success(await call(a, EVENTS.create, create, SessionResultSchema));
  const replay = success(await call(a, EVENTS.create, create, SessionResultSchema));
  assert.deepEqual(replay, host);
  assert.equal(server.rooms.roomCount, 1);
  const conflict = await call(a, EVENTS.create, { ...create, displayName: "Changed" }, SessionResultSchema);
  assert.ok(!conflict.ok); assert.equal(conflict.error.code, "REQUEST_CONFLICT");
  const join = { ...person("Guest"), roomCode: host.state.roomCode };
  const guest = success(await call(b, EVENTS.join, join, SessionResultSchema));
  assert.deepEqual(success(await call(b, EVENTS.join, join, SessionResultSchema)), guest);
  const leave = command(host.state.roomId);
  assert.ok((await call(a, EVENTS.leave, leave, LeaveResultSchema)).ok);
  const nextRoom = success(await call(a, EVENTS.create, person("New Host"), SessionResultSchema));
  assert.ok((await call(a, EVENTS.leave, leave, LeaveResultSchema)).ok);
  const stale = await call(a, EVENTS.ready, { ...command(host.state.roomId), ready: true }, StateResultSchema);
  assert.ok(!stale.ok); assert.equal(stale.error.code, "INVALID_SESSION");
  const current = await call(a, EVENTS.requestState, command(nextRoom.state.roomId), StateResultSchema);
  assert.ok(current.ok); assert.equal(current.state.players[0]?.ready, false);
  assert.equal(current.state.stateVersion, 1);
});

test("ten players fit; an eleventh and capacity reductions below occupied seats are rejected", async (context) => {
  const { connect } = await setup(context);
  const hostPeer = await connect();
  const host = success(await call(hostPeer, EVENTS.create, person("ABCDEFGHIJKLMNOPQRST"), SessionResultSchema));
  const tokens = new Set([host.session.token]);
  for (let i = 1; i < 10; i++) {
    const peer = await connect();
    const joined = success(await call(peer, EVENTS.join, { ...person(`Guest ${i}`), roomCode: host.state.roomCode }, SessionResultSchema));
    tokens.add(joined.session.token);
  }
  assert.equal(tokens.size, 10);
  const outsider = await connect();
  const full = await call(outsider, EVENTS.join, { ...person("Eleventh"), roomCode: host.state.roomCode }, SessionResultSchema);
  assert.ok(!full.ok); assert.equal(full.error.code, "ROOM_FULL");
  const shrink = await call(hostPeer, EVENTS.settings, { ...command(host.state.roomId), settings: { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 9, roundCount: 7, chaos: "chill" } }, StateResultSchema);
  assert.ok(!shrink.ok); assert.equal(shrink.error.code, "SETTINGS_CONFLICT");
  const state = await call(hostPeer, EVENTS.requestState, command(host.state.roomId), StateResultSchema);
  assert.ok(state.ok); assert.equal(state.state.players.length, 10);
  assert.equal(state.state.settings.maxPlayers, 10);
  assert.equal(state.state.settings.roundCount, 5);
});

test("oversized packets close their transport without an authoritative mutation", async (context) => {
  const { connect } = await setup(context);
  const [hostPeer, attacker] = await Promise.all([connect(), connect()]);
  const host = success(await call(hostPeer, EVENTS.create, person("Host"), SessionResultSchema));
  attacker.socket.emit(EVENTS.join, { ...person("x".repeat(5000)), roomCode: host.state.roomCode }, () => {});
  await eventually(() => !attacker.socket.connected, "Oversized transport remained connected");
  const state = await call(hostPeer, EVENTS.requestState, command(host.state.roomId), StateResultSchema);
  assert.ok(state.ok); assert.equal(state.state.players.length, 1);
  assert.equal(state.state.stateVersion, 1);
});

test("room name, visibility, password and lock synchronize; locked resumes still work", async (context) => {
  const { connect } = await setup(context);
  const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, { ...person("Host"), roomName: "  Secret  club  " }, SessionResultSchema));
  assert.equal(host.state.roomName, "Secret club");
  assert.equal(host.state.visibility, "private");
  const roomId = host.state.roomId;
  const member = success(await call(b, EVENTS.join, { ...person("Guest"), roomCode: host.state.roomCode }, SessionResultSchema));
  for (const [event, input] of [[EVENTS.visibility, { visibility: "public" }], [EVENTS.name, { roomName: "GROOT'S TERRIBLE IDEA" }]] as const) {
    assert.ok((await call(a, event, { ...command(roomId), ...input }, StateResultSchema)).ok);
  }
  const bad = await call(a, EVENTS.password, { ...command(roomId), enabled: true, password: "short" }, StateResultSchema);
  assert.ok(!bad.ok); assert.equal(bad.error.code, "INVALID_PASSWORD");
  const password = "Party-secret-42";
  assert.ok((await call(a, EVENTS.password, { ...command(roomId), enabled: true, password }, StateResultSchema)).ok);
  await eventually(() => b.states.at(-1)?.passwordRequired === true);
  assert.equal(b.states.at(-1)?.visibility, "public");
  assert.equal(b.states.at(-1)?.roomName, "GROOT'S TERRIBLE IDEA");
  const required = await call(c, EVENTS.join, { ...person("Third"), roomCode: host.state.roomCode }, SessionResultSchema);
  assert.ok(!required.ok); assert.equal(required.error.code, "PASSWORD_REQUIRED");
  const wrong = await call(c, EVENTS.join, { ...person("Third"), roomCode: host.state.roomCode, password: "wrong-secret" }, SessionResultSchema);
  assert.ok(!wrong.ok); assert.equal(wrong.error.code, "INCORRECT_PASSWORD");
  success(await call(c, EVENTS.join, { ...person("Third"), roomCode: host.state.roomCode, password }, SessionResultSchema));
  assert.ok((await call(a, EVENTS.lock, { ...command(roomId), locked: true }, StateResultSchema)).ok);
  b.socket.disconnect();
  const restored = await connect();
  const resumed = success(await call(restored, EVENTS.resume, { ...request(), credential: { roomId, playerId: member.session.playerId, token: member.session.token } }, SessionResultSchema));
  assert.ok(resumed.state.locked);
  const newcomer = await connect();
  const locked = await call(newcomer, EVENTS.join, { ...person("Newcomer"), roomCode: host.state.roomCode, password, role: "spectator" }, SessionResultSchema);
  assert.ok(!locked.ok); assert.equal(locked.error.code, "ROOM_LOCKED");
  const wire = JSON.stringify(a.states);
  for (const forbidden of [password, "passwordDigest", "securityVersion", "removedSessions", "reportsSent", "credentialHash"]) assert.equal(wire.includes(forbidden), false);
  assert.ok((await call(a, EVENTS.password, { ...command(roomId), enabled: false }, StateResultSchema)).ok);
});

test("host can remove players, spectators and reserved seats; kicked sockets lose chat and resume access", async (context) => {
  const { connect } = await setup(context);
  const a = await connect();
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const roomId = host.state.roomId;
  for (const role of ["player", "spectator", "reserved"] as const) {
    const target = await connect();
    const joined = success(await call(target, EVENTS.join, { ...person("Target"), roomCode: host.state.roomCode, role: role === "spectator" ? "spectator" : "player" }, SessionResultSchema));
    const memberAttack = await call(target, EVENTS.kick, { ...command(roomId), targetPlayerId: host.session.playerId }, StateResultSchema);
    assert.ok(!memberAttack.ok); assert.equal(memberAttack.error.code, "NOT_HOST");
    if (role === "reserved") {
      target.socket.disconnect();
      await eventually(() => a.states.at(-1)?.players.some((p) => p.playerId === joined.session.playerId && !p.connected) === true);
    }
    const kicked = await call(a, EVENTS.kick, { ...command(roomId), targetPlayerId: joined.session.playerId }, StateResultSchema);
    assert.ok(kicked.ok); assert.equal(kicked.state.players.length, 1);
    if (role !== "reserved") await eventually(() => target.ended.at(-1)?.code === "PLAYER_REMOVED" && !target.socket.connected);
    const received = target.states.length;
    assert.ok((await call(a, EVENTS.chat, { ...command(roomId), text: `After ${role} removal` }, StateResultSchema)).ok);
    assert.equal(target.states.length, received);
    const returning = await connect();
    const revoked = await call(returning, EVENTS.resume, { ...request(), credential: { roomId, playerId: joined.session.playerId, token: joined.session.token } }, SessionResultSchema);
    assert.ok(!revoked.ok); assert.equal(revoked.error.code, "PLAYER_REMOVED");
    const fresh = success(await call(returning, EVENTS.join, { ...person("Target"), roomCode: host.state.roomCode }, SessionResultSchema));
    assert.notEqual(fresh.session.playerId, joined.session.playerId);
    assert.ok((await call(returning, EVENTS.leave, command(roomId), LeaveResultSchema)).ok);
  }
  const self = await call(a, EVENTS.kick, { ...command(roomId), targetPlayerId: host.session.playerId }, StateResultSchema);
  assert.ok(!self.ok); assert.equal(self.error.code, "INVALID_TARGET");
});

test("manual host transfer revokes all old host powers and spectators cannot become host", async (context) => {
  const { connect } = await setup(context);
  const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const roomId = host.state.roomId;
  const next = success(await call(b, EVENTS.join, { ...person("Next"), roomCode: host.state.roomCode }, SessionResultSchema));
  const spectator = success(await call(c, EVENTS.join, { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" }, SessionResultSchema));
  const invalid = await call(a, EVENTS.transfer, { ...command(roomId), targetPlayerId: spectator.session.playerId }, StateResultSchema);
  assert.ok(!invalid.ok); assert.equal(invalid.error.code, "INVALID_TARGET");
  assert.ok((await call(a, EVENTS.transfer, { ...command(roomId), targetPlayerId: next.session.playerId }, StateResultSchema)).ok);
  await eventually(() => [a, b, c].every((peer) => peer.states.at(-1)?.hostPlayerId === next.session.playerId));
  const actions = [
    [EVENTS.visibility, { visibility: "public" }], [EVENTS.lock, { locked: true }],
    [EVENTS.password, { enabled: false }], [EVENTS.name, { roomName: "Changed" }],
    [EVENTS.settings, { settings: { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 4, roundCount: 7, chaos: "chill" } }],
    [EVENTS.kick, { targetPlayerId: spectator.session.playerId }], [EVENTS.transfer, { targetPlayerId: host.session.playerId }],
  ] as const;
  for (const [event, input] of actions) {
    const denied = await call(a, event, { ...command(roomId), ...input }, StateResultSchema);
    assert.ok(!denied.ok); assert.equal(denied.error.code, "NOT_HOST");
  }
  assert.ok((await call(b, EVENTS.lock, { ...command(roomId), locked: true }, StateResultSchema)).ok);
  const cannotSpectate = await call(b, EVENTS.role, { ...command(roomId), role: "spectator" }, StateResultSchema);
  assert.ok(!cannotSpectate.ok); assert.equal(cannotSpectate.error.code, "HOST_MUST_TRANSFER");
  assert.equal(b.states.at(-1)?.players.filter((p) => p.isHost).length, 1);
});

test("unique colors are reserved on disconnect and freed on leave; avatar randomization stays valid", async (context) => {
  const { connect } = await setup(context);
  const [a, b] = await Promise.all([connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Green"), SessionResultSchema));
  const roomId = host.state.roomId;
  const guest = success(await call(b, EVENTS.join, { ...person("Other"), roomCode: host.state.roomCode }, SessionResultSchema));
  assert.equal(host.state.players[0]?.playerColor, "lime");
  assert.notEqual(guest.state.players[1]?.playerColor, "lime");
  a.socket.disconnect();
  await eventually(() => b.states.at(-1)?.players[0]?.connected === false);
  const taken = await call(b, EVENTS.color, { ...command(roomId), playerColor: "lime" }, StateResultSchema);
  assert.ok(!taken.ok); assert.equal(taken.error.code, "COLOR_UNAVAILABLE");
  const restored = await connect();
  const resumed = success(await call(restored, EVENTS.resume, { ...request(), credential: { roomId, playerId: host.session.playerId, token: host.session.token } }, SessionResultSchema));
  assert.equal(resumed.state.players[0]?.playerColor, "lime");
  assert.ok((await call(restored, EVENTS.leave, command(roomId), LeaveResultSchema)).ok);
  const free = await call(b, EVENTS.color, { ...command(roomId), playerColor: "lime" }, StateResultSchema);
  assert.ok(free.ok); assert.equal(free.state.players[0]?.playerColor, "lime");
  const random = await call(b, EVENTS.randomize, command(roomId), StateResultSchema);
  assert.ok(random.ok); assert.notEqual(random.state.players[0]?.avatarId, guest.state.players[1]?.avatarId);
  const forged = await call(b, EVENTS.color, { ...command(roomId), playerColor: "lime", targetPlayerId: host.session.playerId }, StateResultSchema);
  assert.ok(!forged.ok); assert.equal(forged.error.code, "INVALID_PAYLOAD");
});

test("spectators have separate capacity, cannot ready, and role changes reset readiness", async (context) => {
  const { connect } = await setup(context);
  const a = await connect();
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const roomId = host.state.roomId;
  assert.ok((await call(a, EVENTS.settings, { ...command(roomId), settings: { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 4, roundCount: 7, chaos: "normal" } }, StateResultSchema)).ok);
  const players: Peer[] = [];
  for (let i = 0; i < 3; i++) {
    const p = await connect(); players.push(p);
    success(await call(p, EVENTS.join, { ...person(`Player ${i}`), roomCode: host.state.roomCode }, SessionResultSchema));
  }
  const watcher = await connect();
  const watching = success(await call(watcher, EVENTS.join, { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" }, SessionResultSchema));
  assert.equal(watching.state.players.length, 5);
  assert.equal(watching.state.players.at(-1)?.playerColor, null);
  for (const [event, extra] of [[EVENTS.ready, { ready: true }], [EVENTS.color, { playerColor: "gold" }]] as const) {
    const result = await call(watcher, event, { ...command(roomId), ...extra }, StateResultSchema);
    assert.ok(!result.ok); assert.equal(result.error.code, "PLAYER_ONLY");
  }
  const full = await call(watcher, EVENTS.role, { ...command(roomId), role: "player" }, StateResultSchema);
  assert.ok(!full.ok); assert.equal(full.error.code, "ROOM_FULL");
  const p = players[0]!;
  assert.ok((await call(p, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  const switched = await call(p, EVENTS.role, { ...command(roomId), role: "spectator" }, StateResultSchema);
  assert.ok(switched.ok);
  assert.equal(switched.state.players[1]?.ready, false);
  assert.equal(switched.state.players[1]?.playerColor, null);
  const promoted = await call(watcher, EVENTS.role, { ...command(roomId), role: "player" }, StateResultSchema);
  assert.ok(promoted.ok); assert.equal(promoted.state.players.at(-1)?.ready, false);
  const colors = promoted.state.players.filter((player) => player.role === "player").map((player) => player.playerColor);
  assert.equal(new Set(colors).size, 4);
  assert.equal(JSON.stringify(watching.state).includes('"token"'), false);
});

test("AFK is synchronized, interaction clears it, and disconnect is a different state", async (context) => {
  const { connect } = await setup(context, { afkMs: 100, sweepMs: 10 });
  const [a, b] = await Promise.all([connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const guest = success(await call(b, EVENTS.join, { ...person("Guest"), roomCode: host.state.roomCode }, SessionResultSchema));
  await eventually(() => [a, b].every((peer) => peer.states.at(-1)?.players.every((p) => p.afk)));
  const active = await call(b, EVENTS.activity, command(host.state.roomId), StateResultSchema);
  assert.ok(active.ok); assert.equal(active.state.players[1]?.afk, false);
  await eventually(() => a.states.at(-1)?.players[1]?.afk === false);
  b.socket.disconnect();
  await eventually(() => a.states.at(-1)?.players[1]?.connected === false);
  assert.equal(a.states.at(-1)?.players[1]?.afk, false);
  assert.equal(a.states.at(-1)?.players[1]?.playerId, guest.session.playerId);
  assert.equal(a.states.at(-1)?.players.length, 2);
});

test("chat is room-local, bounded by rate limits and deduplicated; reports remain private", async (context) => {
  const { connect, server } = await setup(context);
  const [a, b, c, outsider] = await Promise.all([connect(), connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Host"), SessionResultSchema));
  const roomId = host.state.roomId;
  for (const [peer, name] of [[b, "Second"], [c, "Third"]] as const) success(await call(peer, EVENTS.join, { ...person(name), roomCode: host.state.roomCode, role: name === "Third" ? "spectator" : "player" }, SessionResultSchema));
  success(await call(outsider, EVENTS.create, person("Elsewhere"), SessionResultSchema));
  const chat = { ...command(roomId), text: " <script>alert('text only')</script> 😀 " };
  for (let i = 0; i < 2; i++) assert.ok((await call(a, EVENTS.chat, chat, StateResultSchema)).ok);
  await eventually(() => [a, b, c].every((peer) => peer.states.at(-1)?.chatMessages.length === 1));
  assert.equal(b.states.at(-1)?.chatMessages[0]?.text, chat.text.trim());
  assert.equal(outsider.states.at(-1)?.chatMessages.length, 0);
  const forged = await call(outsider, EVENTS.chat, { ...command(roomId), text: "No access" }, StateResultSchema);
  assert.ok(!forged.ok); assert.equal(forged.error.code, "INVALID_SESSION");
  const report = { ...command(roomId), targetPlayerId: host.session.playerId, reason: "spam", description: "Private report note" };
  const before = a.states.at(-1)?.stateVersion;
  for (let i = 0; i < 2; i++) assert.ok((await call(c, EVENTS.report, report, StateResultSchema)).ok);
  assert.equal(server.rooms.reportCount, 1);
  const duplicate = await call(c, EVENTS.report, { ...report, ...request() }, StateResultSchema);
  assert.ok(!duplicate.ok); assert.equal(duplicate.error.code, "REPORT_ALREADY_SENT");
  assert.equal(a.states.at(-1)?.stateVersion, before);
  assert.equal(JSON.stringify(a.states).includes("Private report note"), false);
  const spam = await Promise.all(Array.from({ length: 6 }, () => call(a, EVENTS.chat, { ...command(roomId), text: "Again" }, StateResultSchema)));
  assert.ok(spam.some((result) => !result.ok && result.error.code === "RATE_LIMITED"));
});

test("Button V2 deck, target, turn and challenge settings synchronize and reject client timer authority", async (context) => {
  const { connect } = await setup(context, { buttonCountdownMs: 20, sweepMs: 5 });
  const [a, b, c, d] = await Promise.all([connect(), connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Aster"), SessionResultSchema));
  for (const [peer, name] of [[b, "Birch"], [c, "Cedar"], [d, "Dune"]] as const) await call(peer, EVENTS.join, { ...person(name), roomCode: host.state.roomCode }, SessionResultSchema);
  const roomId = host.state.roomId;
  const configured = { ...DEFAULT_ROOM_SETTINGS, buttonDeckPreset: "custom" as const, buttonCustomDeckSize: 60, buttonTarget: 37, turnTimerSeconds: 20, challengeTimerSeconds: 5, roundCount: 3 as const };
  assert.ok((await call(a, EVENTS.settings, { ...command(roomId), settings: configured }, StateResultSchema)).ok);
  await eventually(() => [a, b, c, d].every((peer) => peer.states.at(-1)?.settings.buttonTarget === 37 && peer.states.at(-1)?.settings.challengeTimerSeconds === 5));
  const nonHost = await call(b, EVENTS.settings, { ...command(roomId), settings: { ...configured, buttonTarget: 38 } }, StateResultSchema);
  assert.ok(!nonHost.ok); assert.equal(nonHost.error.code, "NOT_HOST");
  for (const invalid of [
    { ...configured, buttonCustomDeckSize: 29 }, { ...configured, buttonTarget: 201 },
    { ...configured, turnTimerSeconds: 0 }, { ...configured, challengeTimerSeconds: 31 },
  ]) {
    const result = await call(a, EVENTS.settings, { ...command(roomId), settings: invalid }, StateResultSchema);
    assert.ok(!result.ok); assert.equal(result.error.code, "INVALID_PAYLOAD");
  }
  for (const peer of [a, b, c, d]) assert.ok((await call(peer, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  assert.ok((await call(a, EVENTS.startGame, command(roomId), StateResultSchema)).ok);
  const locked = await call(a, EVENTS.settings, { ...command(roomId), settings: configured }, StateResultSchema);
  assert.ok(!locked.ok); assert.equal(locked.error.code, "GAME_ALREADY_STARTED");
  const forged = await call(b, EVENTS.playCard, { ...command(roomId), cardId: randomUUID(), claim: "PLUS_ONE", counter: 37, deadlineAt: 1 }, StateResultSchema);
  assert.ok(!forged.ok); assert.equal(forged.error.code, "INVALID_PAYLOAD");
});

test("private five-card hands and Secrets reach only their authenticated owner and survive reconnect", async (context) => {
  const { connect } = await setup(context, { buttonCountdownMs: 20, sweepMs: 5 });
  const [a, b, c, d, spectator] = await Promise.all([connect(), connect(), connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Aster"), SessionResultSchema));
  const joins = [
    success(await call(b, EVENTS.join, { ...person("Birch"), roomCode: host.state.roomCode }, SessionResultSchema)),
    success(await call(c, EVENTS.join, { ...person("Cedar"), roomCode: host.state.roomCode }, SessionResultSchema)),
    success(await call(d, EVENTS.join, { ...person("Dune"), roomCode: host.state.roomCode }, SessionResultSchema)),
  ];
  await call(spectator, EVENTS.join, { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" }, SessionResultSchema);
  const roomId = host.state.roomId;
  for (const peer of [a, b, c, d]) assert.ok((await call(peer, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  assert.ok((await call(a, EVENTS.startGame, command(roomId), StateResultSchema)).ok);
  await eventually(() => [a, b, c, d].every((peer) => peer.privateStates.at(-1)?.hand.length === 5));
  assert.equal(spectator.privateStates.length, 0);
  const peers = [a, b, c, d];
  for (const [index, peer] of peers.entries()) {
    const own = peer.privateStates.at(-1)!;
    assert.equal(own.playerId, [host, ...joins][index]!.session.playerId);
    assert.equal(own.privateProgress.status, "in_progress");
    const publicWire = JSON.stringify(peer.states.at(-1));
    assert.equal(/secretRule|privateProgress|inspections|cardTransfers|pendingChoice/.test(publicWire), false);
    for (const card of own.hand) assert.equal(publicWire.includes(card.cardId), false);
  }
  const original = c.privateStates.at(-1)!;
  c.socket.disconnect();
  const restored = await connect();
  success(await call(restored, EVENTS.resume, { ...request(), credential: { roomId, playerId: joins[1]!.session.playerId, token: joins[1]!.session.token } }, SessionResultSchema));
  await eventually(() => restored.privateStates.length === 1);
  assert.equal(restored.privateStates[0]?.secretRule.id, original.secretRule.id);
  assert.equal(restored.privateStates[0]?.revision, original.revision);
  assert.deepEqual(restored.privateStates[0]?.hand, original.hand);
  assert.equal(spectator.privateStates.length, 0);
});

test("four clients converge on first-challenger Button V2 resolution, private punishment, idempotency and reconnect", async (context) => {
  const { connect } = await setup(context, { buttonCountdownMs: 15, challengeTimerMs: 80, challengeRevealMs: 10, sweepMs: 5 });
  const [a, b, c, d, spectator, outsider] = await Promise.all([connect(), connect(), connect(), connect(), connect(), connect()]);
  const host = success(await call(a, EVENTS.create, person("Aster"), SessionResultSchema));
  const sessions = [host,
    success(await call(b, EVENTS.join, { ...person("Birch"), roomCode: host.state.roomCode }, SessionResultSchema)),
    success(await call(c, EVENTS.join, { ...person("Cedar"), roomCode: host.state.roomCode }, SessionResultSchema)),
    success(await call(d, EVENTS.join, { ...person("Dune"), roomCode: host.state.roomCode }, SessionResultSchema)),
  ];
  await call(spectator, EVENTS.join, { ...person("Watcher"), roomCode: host.state.roomCode, role: "spectator" }, SessionResultSchema);
  const roomId = host.state.roomId;
  const peers = [a, b, c, d];
  for (const peer of peers) assert.ok((await call(peer, EVENTS.ready, { ...command(roomId), ready: true }, StateResultSchema)).ok);
  assert.ok((await call(a, EVENTS.startGame, command(roomId), StateResultSchema)).ok);
  await eventually(() => peers.every((peer) => peer.privateStates.at(-1)?.hand.length === 5));
  for (const peer of peers) assert.ok((await call(peer, EVENTS.acknowledgeRule, command(roomId), StateResultSchema)).ok);
  await eventually(() => peers.every((peer) => peer.states.at(-1)?.publicRound?.phase === "turn_action"));
  const activeId = a.states.at(-1)!.publicRound!.publicGameState.currentPlayerId!;
  const activeIndex = sessions.findIndex((session) => session.session.playerId === activeId);
  const actor = peers[activeIndex]!;
  const actual = actor.privateStates.at(-1)!.hand[0]!;
  const claim = actual.kind === "PLUS_ONE" ? "PLUS_TWO" : "PLUS_ONE";
  const malicious = await call(actor, EVENTS.playCard, { ...command(roomId), cardId: actual.cardId, claim, actualCard: actual.kind }, StateResultSchema);
  assert.ok(!malicious.ok); assert.equal(malicious.error.code, "INVALID_PAYLOAD");
  const spectatorPlay = await call(spectator, EVENTS.playCard, { ...command(roomId), cardId: randomUUID(), claim: "PLUS_ONE" }, StateResultSchema);
  assert.ok(!spectatorPlay.ok); assert.equal(spectatorPlay.error.code, "PLAYER_ONLY");
  const outsiderPlay = await call(outsider, EVENTS.playCard, { ...command(roomId), cardId: randomUUID(), claim: "PLUS_ONE" }, StateResultSchema);
  assert.ok(!outsiderPlay.ok); assert.equal(outsiderPlay.error.code, "INVALID_SESSION");
  const playPayload = { ...command(roomId), cardId: actual.cardId, claim };
  const played = await call(actor, EVENTS.playCard, playPayload, StateResultSchema);
  assert.ok(played.ok); assert.equal(played.state.publicRound?.phase, "challenge");
  assert.equal(JSON.stringify(played.state).includes(actual.cardId), false);
  const duplicate = await call(actor, EVENTS.playCard, playPayload, StateResultSchema);
  assert.ok(duplicate.ok); assert.equal(duplicate.state.stateVersion, played.state.stateVersion);
  const challengers = peers.filter((peer) => peer !== actor);
  const attempts = await Promise.all(challengers.slice(0, 2).map((peer) => call(peer, EVENTS.callBluff, command(roomId), StateResultSchema)));
  assert.equal(attempts.filter((result) => result.ok).length, 1);
  assert.equal(attempts.filter((result) => !result.ok && result.error.code === "CHALLENGE_CLOSED").length, 1);
  await eventually(() => peers.every((peer) => peer.states.at(-1)?.publicRound?.phase === "penalty_discard"));
  const penaltyId = activeId;
  const penaltyIndex = sessions.findIndex((session) => session.session.playerId === penaltyId);
  const punished = peers[penaltyIndex]!;
  await eventually(() => punished.privateStates.at(-1)?.pendingChoice?.kind === "penalty_discard");
  const pending = punished.privateStates.at(-1)!;
  punished.socket.disconnect();
  const restored = await connect();
  success(await call(restored, EVENTS.resume, { ...request(), credential: { roomId, playerId: penaltyId, token: sessions[penaltyIndex]!.session.token } }, SessionResultSchema));
  await eventually(() => restored.privateStates.at(-1)?.pendingChoice?.kind === "penalty_discard");
  assert.ok((await call(restored, EVENTS.penaltyDiscard, { ...command(roomId), cardId: pending.hand[0]!.cardId }, StateResultSchema)).ok);
  await eventually(() => [a, b, c, d, spectator].filter((peer) => peer.socket.connected).every((peer) => peer.states.at(-1)?.publicRound?.phase === "turn_action"));
  const publicWire = JSON.stringify(spectator.states.at(-1));
  assert.equal(publicWire.includes(pending.hand[0]!.cardId), false);
  assert.equal(spectator.privateStates.length, 0);
});
