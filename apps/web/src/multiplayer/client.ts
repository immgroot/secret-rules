import { io, type Socket } from "socket.io-client";
import type { z } from "zod";
import {
  EVENTS, PROTOCOL_VERSION, CreateRoomSchema, JoinRoomSchema, ResumeSessionSchema, RoomCommandSchema,
  STATE_COMMAND_SCHEMAS, PublicRoomSnapshotSchema, PrivateRoundDeliverySchema, ServerErrorSchema,
  SessionResultSchema, StateResultSchema, LeaveResultSchema, protocolError,
  type ClientToServerEvents, type ServerToClientEvents, type SessionGrant, type ServerError,
  type AvatarId, type PlayerRole, type RoomSettings, type StateResult,
  type StateCommandName, type StateCommandInput, type StateCommandPayload, type PrivatePlayerRoundState,
} from "@secret-rules/shared";
import { publicEnv } from "../config/env.ts";
import { readRoomSession, saveRoomSession, type SessionStorage } from "./session.ts";
import { INITIAL_LOBBY, newerSnapshot, type LobbySnapshot } from "./state.ts";
import { readMutes, saveMutes } from "./mute.ts";
import { observeActivity } from "./activity.ts";

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;
class RequestError extends Error {
  readonly detail: ServerError;
  constructor(detail: ServerError) { super(detail.code); this.detail = detail; }
}

/** One transport and one snapshot store per page; the homepage demo never imports this. */
export class LobbyClient {
  private snapshot = INITIAL_LOBBY;
  private readonly listeners = new Set<() => void>();
  private readonly requests = new Set<() => void>();
  private socket: LobbySocket | null = null;
  private credential: SessionGrant | null = null;
  private storage: SessionStorage | null = null;
  private preferences: SessionStorage | null = null;
  private pendingPrivate: PrivatePlayerRoundState | null = null;
  private epoch = 0;
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL_LOBBY;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(change: Partial<LobbySnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
  mount() {
    this.epoch++;
    try { this.storage = window.sessionStorage; } catch { this.storage = null; }
    try { this.preferences = window.localStorage; } catch { this.preferences = null; }
    const stopActivity = observeActivity(window, () => { void this.send(EVENTS.activity, {}, true); });
    this.credential = readRoomSession(this.storage);
    this.patch({ initialized: true, storageAvailable: this.storage !== null, resumeRoomCode: this.credential?.roomCode ?? null });
    if (this.credential) { this.patch({ connection: "reconnecting" }); this.getSocket().connect(); }
    return () => {
      stopActivity();
      this.epoch++;
      const socket = this.socket;
      this.socket = null;
      for (const cancel of [...this.requests]) cancel();
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }
  private getSocket(): LobbySocket {
    if (this.socket) return this.socket;
    const socket: LobbySocket = io(publicEnv.NEXT_PUBLIC_REALTIME_URL, {
      autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000,
      timeout: 5000, auth: { protocolVersion: PROTOCOL_VERSION },
    });
    this.socket = socket;
    socket.on("connect", () => {
      if (this.socket !== socket) return;
      if (this.credential) void this.resume();
      else this.patch({ connection: "connected", error: null });
    });
    socket.on("connect_error", () => {
      if (this.socket !== socket || this.snapshot.connection === "ended") return;
      this.patch({ connection: this.credential ? "reconnecting" : "idle", error: protocolError("CONNECTION_LOST") });
    });
    socket.on("disconnect", () => {
      if (this.socket !== socket) return;
      for (const cancel of [...this.requests]) cancel();
      if (this.snapshot.connection !== "ended") this.patch({ connection: this.credential ? "reconnecting" : "idle", pending: false });
    });
    socket.on(EVENTS.update, (raw) => this.accept(raw));
    socket.on(EVENTS.privateState, (raw) => this.acceptPrivate(raw));
    socket.on(EVENTS.error, (raw) => {
      const result = ServerErrorSchema.safeParse(raw);
      this.patch({ error: result.success ? result.data : protocolError("SERVER_ERROR") });
    });
    socket.on(EVENTS.ended, (raw) => {
      const result = ServerErrorSchema.safeParse(raw);
      this.end(result.success ? result.data : protocolError("INVALID_SESSION"));
    });
    return socket;
  }
  private accept(raw: unknown) {
    const result = PublicRoomSnapshotSchema.safeParse(raw);
    if (!result.success) { this.patch({ error: protocolError("SERVER_ERROR") }); return; }
    if (!this.credential) return;
    const room = newerSnapshot(this.snapshot.room, result.data, this.credential.roomId, this.credential.playerId);
    if (room !== this.snapshot.room) {
      const pending = this.pendingPrivate;
      const matchesPending = pending !== null && room?.publicRound?.roundId === pending.roundId;
      if (pending && room?.publicRound && !matchesPending) this.pendingPrivate = null;
      if (matchesPending) this.pendingPrivate = null;
      this.patch({ room, ...(matchesPending ? { privateRound: pending } : room?.publicRound ? {} : { privateRound: null }) });
    }
  }
  private acceptPrivate(raw: unknown) {
    const result = PrivateRoundDeliverySchema.safeParse(raw);
    if (!result.success) { this.patch({ error: protocolError("SERVER_ERROR") }); return; }
    if (result.data.state === null) { this.pendingPrivate = null; this.patch({ privateRound: null }); return; }
    const state = result.data.state;
    if (!this.credential || state.playerId !== this.credential.playerId) {
      this.patch({ error: protocolError("SERVER_ERROR") }); return;
    }
    if (this.snapshot.room?.publicRound?.roundId !== state.roundId) { this.pendingPrivate = state; return; }
    this.pendingPrivate = null;
    this.patch({ privateRound: state });
  }
  private end(error: ServerError) {
    this.epoch++;
    this.credential = null;
    this.pendingPrivate = null;
    saveRoomSession(this.storage, null);
    this.patch({ room: null, privateRound: null, playerId: null, resumeRoomCode: null, pending: false, connection: "ended", error });
    this.socket?.disconnect();
  }
  clearError = () => this.patch({ error: null });
  toggleMute = (targetId: string) => {
    if (!this.credential || targetId === this.credential.playerId || !this.snapshot.room?.players.some((player) => player.playerId === targetId)) return;
    const muted = this.snapshot.mutedPlayerIds.includes(targetId) ? this.snapshot.mutedPlayerIds.filter((id) => id !== targetId) : [...this.snapshot.mutedPlayerIds, targetId].slice(-100);
    this.patch({ mutedPlayerIds: muted });
    saveMutes(this.preferences, this.credential.roomId, this.credential.playerId, muted);
  };
  clearMutes = () => {
    this.patch({ mutedPlayerIds: [] });
    if (this.credential) saveMutes(this.preferences, this.credential.roomId, this.credential.playerId, []);
  };

  private async connected() {
    const socket = this.getSocket();
    if (socket.connected) return socket;
    this.patch({ connection: this.credential ? "reconnecting" : "connecting" });
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: RequestError) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.requests.delete(onError);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
        if (error) reject(error); else resolve();
      };
      const onConnect = () => finish();
      const onError = () => finish(new RequestError(protocolError("CONNECTION_LOST")));
      const timeout = setTimeout(onError, 6000);
      this.requests.add(onError);
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
      socket.connect();
    });
    return socket;
  }
  private ask<T>(schema: z.ZodType<T>, emit: (reply: (raw: unknown) => void) => void): Promise<T> {
    if (!this.socket?.connected) return Promise.reject(new RequestError(protocolError("CONNECTION_LOST")));
    return new Promise((resolve, reject) => {
      let finished = false;
      let retries = 0;
      const done = (error: RequestError | null, value?: T) => {
        if (finished) return;
        finished = true; clearTimeout(timeout); this.requests.delete(cancel);
        if (error) reject(error); else if (value !== undefined) resolve(value);
      };
      const cancel = () => done(new RequestError(protocolError("CONNECTION_LOST")));
      const reply = (raw: unknown) => {
        const result = schema.safeParse(raw);
        if (result.success) done(null, result.data); else done(new RequestError(protocolError("SERVER_ERROR")));
      };
      const timedOut = () => {
        // One same-ID retry only on the current connected transport; never buffer offline intents.
        if (retries++ === 0 && this.socket?.connected) { timeout = setTimeout(timedOut, 4000); emit(reply); }
        else cancel();
      };
      let timeout = setTimeout(timedOut, 4000);
      this.requests.add(cancel);
      emit(reply);
    });
  }
  private report(error: unknown) {
    const detail = error instanceof RequestError ? error.detail : protocolError("SERVER_ERROR");
    if (!detail.recoverable) this.end(detail); else this.patch({ error: detail });
  }
  private async resume() {
    const credential = this.credential;
    const epoch = this.epoch;
    if (!credential || !this.socket?.connected) return;
    this.patch({ connection: "reconnecting", pending: true });
    const payload = ResumeSessionSchema.parse({ requestId: crypto.randomUUID(), credential: { roomId: credential.roomId, playerId: credential.playerId, token: credential.token } });
    try {
      const result = await this.ask(SessionResultSchema, (reply) => this.socket?.emit(EVENTS.resume, payload, reply));
      if (epoch !== this.epoch) return;
      if (!result.ok) throw new RequestError(result.error);
      this.establish(result.session, result.state);
    } catch (error) { if (epoch === this.epoch) this.report(error); }
    finally { if (epoch === this.epoch) this.patch({ pending: false }); }
  }
  private establish(session: SessionGrant, state: unknown) {
    const sameIdentity = this.credential?.roomId === session.roomId && this.credential.playerId === session.playerId;
    if (this.pendingPrivate?.playerId !== session.playerId) this.pendingPrivate = null;
    this.credential = session;
    this.patch({ room: this.snapshot.room?.roomId === session.roomId ? this.snapshot.room : null, privateRound: sameIdentity ? this.snapshot.privateRound : null, playerId: session.playerId, resumeRoomCode: session.roomCode,
      storageAvailable: saveRoomSession(this.storage, session), connection: "connected", error: null,
      mutedPlayerIds: sameIdentity ? this.snapshot.mutedPlayerIds : readMutes(this.preferences, session.roomId, session.playerId) });
    this.accept(state);
  }
  async enter(mode: "create" | "join", input: { displayName: string; avatarId: AvatarId; roomCode?: string; roomName?: string; password?: string; role?: PlayerRole }) {
    if (this.snapshot.pending) return null;
    if (this.credential) { this.patch({ error: protocolError("SESSION_ACTIVE") }); return null; }
    const epoch = this.epoch;
    this.patch({ pending: true, error: null });
    try {
      const socket = await this.connected();
      if (epoch !== this.epoch) return null;
      const payload = { requestId: crypto.randomUUID(), ...input };
      let result;
      if (mode === "create") {
        const parsed = CreateRoomSchema.safeParse({ requestId: payload.requestId, displayName: payload.displayName, avatarId: payload.avatarId, ...(input.roomName ? { roomName: input.roomName } : {}) });
        if (!parsed.success) throw new RequestError(protocolError(parsed.error.issues[0]?.path[0] === "roomName" ? "INVALID_ROOM_NAME" : "INVALID_DISPLAY_NAME"));
        result = await this.ask(SessionResultSchema, (reply) => socket.emit(EVENTS.create, parsed.data, reply));
      } else {
        const parsed = JoinRoomSchema.safeParse({ requestId: payload.requestId, displayName: input.displayName, avatarId: input.avatarId, roomCode: input.roomCode, role: input.role, password: input.password });
        if (!parsed.success) throw new RequestError(protocolError(parsed.error.issues[0]?.path[0] === "roomCode" ? "INVALID_ROOM_CODE" : parsed.error.issues[0]?.path[0] === "password" ? "INVALID_PASSWORD" : "INVALID_DISPLAY_NAME"));
        result = await this.ask(SessionResultSchema, (reply) => socket.emit(EVENTS.join, parsed.data, reply));
      }
      if (epoch !== this.epoch) return null;
      if (!result.ok) throw new RequestError(result.error);
      this.establish(result.session, result.state);
      return result.state;
    } catch (error) { if (epoch === this.epoch) this.report(error); return null; }
    finally { if (epoch === this.epoch) this.patch({ pending: false }); }
  }
  async send<K extends StateCommandName>(event: K, input: StateCommandInput<K>, background = false): Promise<boolean> {
    if (!this.credential || (!background && this.snapshot.pending) || this.snapshot.connection !== "connected" || !this.socket?.connected) return false;
    const epoch = this.epoch;
    if (!background) this.patch({ pending: true, error: null });
    try {
      const parsed = STATE_COMMAND_SCHEMAS[event].safeParse({ ...input, requestId: crypto.randomUUID(), roomId: this.credential.roomId });
      if (!parsed.success) throw new RequestError(protocolError(event === EVENTS.password ? "INVALID_PASSWORD" : event === EVENTS.name ? "INVALID_ROOM_NAME" : event === EVENTS.chat ? "INVALID_CHAT" : event === EVENTS.report ? "INVALID_REPORT" : "INVALID_PAYLOAD"));
      // Socket.IO cannot correlate a generic mapped event with its argument tuple.
      // This adapter preserves that pairing; the selected shared schema validated it above.
      const emit = this.socket.emit.bind(this.socket) as <N extends StateCommandName>(name: N, payload: StateCommandPayload<N>, reply: (raw: unknown) => void) => LobbySocket;
      const result: StateResult = await this.ask(StateResultSchema, (reply) => emit(event, parsed.data as StateCommandPayload<K>, reply));
      if (epoch !== this.epoch) return false;
      if (!result.ok) throw new RequestError(result.error);
      this.accept(result.state);
      return true;
    } catch (error) { if (epoch === this.epoch && !background) this.report(error); return false; }
    finally { if (epoch === this.epoch && !background) this.patch({ pending: false }); }
  }
  setReady = (ready: boolean) => this.send(EVENTS.ready, { ready });
  updateSettings = (settings: RoomSettings) => this.send(EVENTS.settings, { settings });
  requestState = () => this.send(EVENTS.requestState, {});
  startGame = () => this.send(EVENTS.startGame, {});
  acknowledgeRule = () => this.send(EVENTS.acknowledgeRule, {});
  pressButton = () => this.send(EVENTS.buttonPress, {});
  continueRound = () => this.send(EVENTS.continueRound, {});
  returnToLobby = () => this.send(EVENTS.returnToLobby, {});
  retry = () => { this.patch({ error: null }); if (this.socket?.connected && this.credential) void this.resume(); else this.getSocket().connect(); };
  async leave() {
    if (!this.credential || this.snapshot.pending || !this.socket?.connected || this.snapshot.connection !== "connected") return false;
    const epoch = this.epoch;
    const payload = RoomCommandSchema.parse({ requestId: crypto.randomUUID(), roomId: this.credential.roomId });
    this.patch({ pending: true, error: null });
    try {
      const result = await this.ask(LeaveResultSchema, (reply) => this.socket?.emit(EVENTS.leave, payload, reply));
      if (epoch !== this.epoch) return false;
      if (!result.ok) throw new RequestError(result.error);
      this.credential = null;
      this.pendingPrivate = null;
      saveRoomSession(this.storage, null);
      this.patch({ room: null, privateRound: null, playerId: null, resumeRoomCode: null, connection: "idle" });
      this.socket.disconnect();
      return true;
    } catch (error) { if (epoch === this.epoch) this.report(error); return false; }
    finally { if (epoch === this.epoch) this.patch({ pending: false }); }
  }
}
