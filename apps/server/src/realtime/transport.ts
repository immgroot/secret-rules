import type { Server as HttpServer } from "node:http";
import { createHash } from "node:crypto";
import { Server } from "socket.io";
import type { z } from "zod";
import {
  EVENTS, COMMAND_SCHEMAS, HandshakeSchema, ServerErrorSchema, PublicRoomSnapshotSchema, PrivateRoundDeliverySchema,
  SessionResultSchema, StateResultSchema, LeaveResultSchema, FailureSchema, protocolError,
  type ClientToServerEvents, type ServerToClientEvents, type SessionResult, type CreateRoom, type JoinRoom,
} from "@secret-rules/shared";
import { RoomOwner, LobbyError, type RoomOwnerOptions } from "../rooms/room-owner.ts";
import { RoomPasswords } from "../rooms/passwords.ts";
import { RateLimiter } from "./rate-limiter.ts";

const schemas: Readonly<Record<string, z.ZodType>> = COMMAND_SCHEMAS;
export interface RealtimeOptions {
  allowedOrigins: readonly string[];
  graceMs?: number;
  idleMs?: number;
  sweepMs?: number;
  maxRooms?: number;
  afkMs?: number;
  buttonCountdownMs?: number;
  buttonDurationMs?: number;
  buttonResolutionMs?: number;
  buttonRechargeMs?: number;
}

export function attachRealtime(httpServer: HttpServer, options: RealtimeOptions) {
  const limiter = new RateLimiter();
  const passwords = new RoomPasswords();
  const ipConnections = new Map<string, number>();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false, maxHttpBufferSize: 4096, connectTimeout: 5000,
    pingInterval: 10_000, pingTimeout: 5000,
    cors: { origin: [...options.allowedOrigins], methods: ["GET", "POST"] },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      const ip = request.socket.remoteAddress ?? "unknown";
      const allowed = typeof origin === "string" && options.allowedOrigins.includes(origin) &&
        (ipConnections.get(ip) ?? 0) < 40 && io.engine.clientsCount < 1000 && limiter.take(`connect:${ip}`, 120, 60_000);
      callback(null, allowed);
    },
  });
  const ownerOptions: RoomOwnerOptions = {
    ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
    ...(options.idleMs === undefined ? {} : { idleMs: options.idleMs }),
    ...(options.maxRooms === undefined ? {} : { maxRooms: options.maxRooms }),
    ...(options.afkMs === undefined ? {} : { afkMs: options.afkMs }),
    ...(options.buttonCountdownMs === undefined ? {} : { buttonCountdownMs: options.buttonCountdownMs }),
    ...(options.buttonDurationMs === undefined ? {} : { buttonDurationMs: options.buttonDurationMs }),
    ...(options.buttonResolutionMs === undefined ? {} : { buttonResolutionMs: options.buttonResolutionMs }),
    ...(options.buttonRechargeMs === undefined ? {} : { buttonRechargeMs: options.buttonRechargeMs }),
    publish(state, recipients) {
      const payload = PublicRoomSnapshotSchema.parse(state);
      // Direct allowlisted fanout. No client-selected transport group can authorize a recipient.
      for (const id of recipients) io.sockets.sockets.get(id)?.emit(EVENTS.update, payload);
    },
    publishPrivate(state, recipientSocketId) {
      const payload = PrivateRoundDeliverySchema.parse({ state });
      // One authenticated socket, one recipient-specific projection. Never a room broadcast.
      io.sockets.sockets.get(recipientSocketId)?.emit(EVENTS.privateState, payload);
    },
    endSocket(id, reason) {
      const socket = io.sockets.sockets.get(id);
      socket?.emit(EVENTS.ended, ServerErrorSchema.parse(reason));
      // Disconnect removes every Socket.IO transport room; RoomOwner has already revoked the binding.
      socket?.disconnect(true);
    },
  };
  const rooms = new RoomOwner(ownerOptions);
  const cleanup = setInterval(() => { rooms.sweep(); limiter.sweep(); }, options.sweepMs ?? 1000);
  cleanup.unref();

  io.use((socket, next) => {
    if ((ipConnections.get(socket.handshake.address) ?? 0) >= 40) {
      next(Object.assign(new Error("Connection limit reached."), { data: ServerErrorSchema.parse(protocolError("SERVER_BUSY")) }));
      return;
    }
    if (!HandshakeSchema.safeParse(socket.handshake.auth).success) {
      next(Object.assign(new Error("Unsupported handshake."), { data: ServerErrorSchema.parse(protocolError("INVALID_PAYLOAD")) }));
      return;
    }
    next();
  });

  io.on("connection", (socket) => {
    const ip = socket.handshake.address;
    ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
    type Grant = Extract<SessionResult, { ok: true }>;
    const entries = new Map<string, { signature: string; result: Promise<Grant> }>();
    const left = new Set<string>();

    socket.use((packet, next) => {
      const [event, raw, reply] = packet;
      const reject = (code: Parameters<typeof protocolError>[0]) => {
        const failure = FailureSchema.parse({ ok: false, error: protocolError(code) });
        if (typeof reply === "function") reply(failure); else socket.emit(EVENTS.error, failure.error);
      };
      if (!limiter.take(`socket:${socket.id}`, 40, 10_000)) { reject("RATE_LIMITED"); return; }
      const schema = typeof event === "string" && Object.hasOwn(schemas, event) ? schemas[event] : undefined;
      if (!schema || packet.length !== 3 || typeof reply !== "function") { reject("INVALID_PAYLOAD"); return; }
      const result = schema.safeParse(raw);
      if (!result.success) {
        const field = result.error.issues[0]?.path[0];
        reject(field === "displayName" ? "INVALID_DISPLAY_NAME" : field === "roomCode" ? "INVALID_ROOM_CODE" :
          field === "roomName" ? "INVALID_ROOM_NAME" : field === "password" ? "INVALID_PASSWORD" :
          event === EVENTS.chat ? "INVALID_CHAT" : event === EVENTS.report ? "INVALID_REPORT" : "INVALID_PAYLOAD");
        return;
      }
      const allowance = event === EVENTS.create || event === EVENTS.password ? 5 : event === EVENTS.join ? 30 : event === EVENTS.resume ? 60 : 120;
      if (!limiter.take(`action:${ip}:${event}`, allowance, 60_000) ||
          (event === EVENTS.report && !limiter.take(`report:${ip}`, 10, 600_000)) ||
          ((event === EVENTS.ready || event === EVENTS.settings || event === EVENTS.randomize) && !limiter.take(`change:${socket.id}`, 12, 1000))) {
        reject("RATE_LIMITED"); return;
      }
      packet[1] = result.data;
      next();
    });

    const failure = (error: unknown) => ({ ok: false, error: error instanceof LobbyError ? error.detail : protocolError("SERVER_ERROR") });
    function respond<T>(schema: z.ZodType<T>, reply: (result: T) => void, action: () => unknown) {
      let result: T;
      try { result = schema.parse(action()); } catch (error) { result = schema.parse(failure(error)); }
      reply(result);
    }
    async function respondAsync<T>(schema: z.ZodType<T>, reply: (result: T) => void, action: () => Promise<unknown>) {
      let result: T;
      try { result = schema.parse(await action()); } catch (error) { result = schema.parse(failure(error)); }
      if (socket.connected) reply(result);
    }
    function requireConnected() {
      if (!socket.connected) throw new LobbyError("INVALID_SESSION");
    }
    async function enter(event: typeof EVENTS.create | typeof EVENTS.join, input: CreateRoom | JoinRoom, action: () => Grant | Promise<Grant>) {
      const signature = createHash("sha256").update(`${event}:${JSON.stringify(input)}`).digest("hex");
      let entry = entries.get(input.requestId);
      if (entry && entry.signature !== signature) throw new LobbyError("REQUEST_CONFLICT");
      if (!entry) {
        const result = Promise.resolve().then(() => { requireConnected(); return action(); });
        entry = { signature, result };
        entries.set(input.requestId, entry);
      }
      try {
        const grant = await entry.result;
        requireConnected();
        return { ...grant, state: rooms.requestState(socket.id, grant.session.roomId).state };
      } catch (error) { entries.delete(input.requestId); throw error; }
    }

    socket.on(EVENTS.create, (input, reply) => void respondAsync(SessionResultSchema, reply,
      () => enter(EVENTS.create, input, () => rooms.create(socket.id, input))));
    socket.on(EVENTS.join, (input, reply) => void respondAsync(SessionResultSchema, reply,
      () => enter(EVENTS.join, input, async () => {
        const challenge = rooms.joinChallenge(socket.id, input);
        if (challenge.digest) {
          if (!input.password) throw new LobbyError("PASSWORD_REQUIRED");
          if (!await passwords.verify(input.password, challenge.digest)) throw new LobbyError("INCORRECT_PASSWORD");
        }
        requireConnected();
        // Recheck lock, membership, capacity and password revision AFTER asynchronous verification.
        return rooms.join(socket.id, input, { roomId: challenge.roomId, version: challenge.version });
      })));
    socket.on(EVENTS.password, (input, reply) => void respondAsync(StateResultSchema, reply, async () => {
      const version = rooms.passwordRevision(socket.id, input.roomId);
      const digest = input.enabled ? await passwords.hash(input.password) : null;
      requireConnected();
      return rooms.setPassword(socket.id, input, digest, version);
    }));
    socket.on(EVENTS.resume, (input, reply) => respond(SessionResultSchema, reply, () => rooms.resume(socket.id, input.credential)));
    socket.on(EVENTS.ready, (input, reply) => respond(StateResultSchema, reply, () => rooms.setReady(socket.id, input)));
    socket.on(EVENTS.settings, (input, reply) => respond(StateResultSchema, reply, () => rooms.updateSettings(socket.id, input)));
    socket.on(EVENTS.requestState, (input, reply) => respond(StateResultSchema, reply, () => rooms.requestState(socket.id, input.roomId)));
    socket.on(EVENTS.visibility, (input, reply) => respond(StateResultSchema, reply, () => rooms.setVisibility(socket.id, input)));
    socket.on(EVENTS.lock, (input, reply) => respond(StateResultSchema, reply, () => rooms.setLock(socket.id, input)));
    socket.on(EVENTS.name, (input, reply) => respond(StateResultSchema, reply, () => rooms.setName(socket.id, input)));
    socket.on(EVENTS.kick, (input, reply) => respond(StateResultSchema, reply, () => rooms.kick(socket.id, input)));
    socket.on(EVENTS.transfer, (input, reply) => respond(StateResultSchema, reply, () => rooms.transferHost(socket.id, input)));
    socket.on(EVENTS.avatar, (input, reply) => respond(StateResultSchema, reply, () => rooms.setAvatar(socket.id, input)));
    socket.on(EVENTS.color, (input, reply) => respond(StateResultSchema, reply, () => rooms.setColor(socket.id, input)));
    socket.on(EVENTS.randomize, (input, reply) => respond(StateResultSchema, reply, () => rooms.randomizeAvatar(socket.id, input)));
    socket.on(EVENTS.role, (input, reply) => respond(StateResultSchema, reply, () => rooms.setRole(socket.id, input)));
    socket.on(EVENTS.activity, (input, reply) => respond(StateResultSchema, reply, () => rooms.activity(socket.id, input)));
    socket.on(EVENTS.chat, (input, reply) => respond(StateResultSchema, reply, () => rooms.sendChat(socket.id, input)));
    socket.on(EVENTS.report, (input, reply) => respond(StateResultSchema, reply, () => rooms.reportPlayer(socket.id, input)));
    socket.on(EVENTS.startGame, (input, reply) => respond(StateResultSchema, reply, () => rooms.startGame(socket.id, input)));
    socket.on(EVENTS.acknowledgeRule, (input, reply) => respond(StateResultSchema, reply, () => rooms.acknowledgeRule(socket.id, input)));
    socket.on(EVENTS.buttonPress, (input, reply) => respond(StateResultSchema, reply, () => rooms.pressButton(socket.id, input)));
    socket.on(EVENTS.continueRound, (input, reply) => respond(StateResultSchema, reply, () => rooms.continueRound(socket.id, input)));
    socket.on(EVENTS.returnToLobby, (input, reply) => respond(StateResultSchema, reply, () => rooms.returnToLobby(socket.id, input)));
    socket.on(EVENTS.leave, (input, reply) => respond(LeaveResultSchema, reply, () => {
      const key = `${input.roomId}:${input.requestId}`;
      if (left.has(key)) return { ok: true };
      const result = rooms.leave(socket.id, input.roomId);
      entries.clear();
      left.add(key);
      if (left.size > 128) left.delete(left.values().next().value!);
      return result;
    }));
    socket.on("disconnect", () => {
      rooms.disconnect(socket.id);
      entries.clear(); left.clear();
      const remaining = (ipConnections.get(ip) ?? 1) - 1;
      if (remaining > 0) ipConnections.set(ip, remaining); else ipConnections.delete(ip);
    });
  });

  return { io, rooms, close: () => new Promise<void>((resolve) => {
    clearInterval(cleanup);
    passwords.close();
    rooms.dispose();
    limiter.clear();
    io.close(() => { ipConnections.clear(); resolve(); });
  }) };
}
