import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_ROOM_SETTINGS, ROOM_CODE_ALPHABET, PublicRoomSnapshotSchema, protocolError,
  AVATAR_IDS, PLAYER_COLORS, MAX_SPECTATORS, MAX_CHAT_MESSAGES, AFK_THRESHOLD_MS, EVENTS,
  type CreateRoom, type JoinRoom, type PublicPlayer, type PublicRoomSnapshot,
  type SessionCredential, type SessionGrant, type ServerError, type ErrorCode,
  type SetReady, type UpdateSettings, type PlayerRole, type PlayerColor, type AvatarId,
  type StateCommandName, type StateCommandPayload, type RoomRequest, type ReportReason,
  type PrivatePlayerRoundState, type ObservableGameEvent, type ButtonOutcome, type RoundPhase,
} from "@secret-rules/shared";
import type { PasswordDigest } from "./passwords.ts";
import { appendRuleHistory, THE_BUTTON_MINI_GAME, generateRuleSet, type GeneratedRuleSet } from "../rules/engine.ts";
import type { RuleHistoryEntry } from "../rules/types.ts";
import {
  BUTTON_COUNTDOWN_MS, BUTTON_RECHARGE_MS, BUTTON_RESOLUTION_MS, BUTTON_TARGET,
  buttonGameEventsForPress, buttonOutcomeForCounter, finalizeButtonAssignments, initializeButtonEvents, pressEvents, resolveButtonPress, sanitizedAction, updateButtonAssignments,
  type ButtonGameEvent, type ButtonPressRecord,
} from "../games/button/engine.ts";
import { buttonRuleHasWildScoreBonus } from "../games/button/catalog.ts";
import { CLASSIC_BUTTON_MODE } from "../games/button/modes.ts";
import { rankedStandings, scoreRound, winners } from "../scoring/engine.ts";

export class LobbyError extends Error {
  readonly detail: ServerError;
  constructor(code: ErrorCode) { super(code); this.detail = protocolError(code); }
}

export type PlayerState = Omit<PublicPlayer, "isHost"> & {
  credentialHash: Buffer;
  socketId: string | null;
  disconnectedUntil: number | null;
  requests: Map<string, string>;
  lastActivityAt: number;
  chatTimes: number[];
  reportsSent: { targetId: string; at: number }[];
};
type ReportRecord = { reportId: string; reporterId: string; targetId: string; reason: ReportReason; description: string; createdAt: number };
type ServerButtonRound = GeneratedRuleSet & {
  phase: RoundPhase; counter: number; countdownEndsAt: number | null; deadlineAt: number | null; durationMs: number;
  resolutionEndsAt: number | null; outcome: ButtonOutcome; pressHistory: ButtonPressRecord[];
  rechargeEndsAt: number | null; lastNormalActorPlayerId: string | null;
  observableEvents: ObservableGameEvent[]; participantNames: ReadonlyMap<string, string>;
  buttonEvents: ButtonGameEvent[]; timerThresholdEmitted: boolean;
};
export type RoomState = Omit<PublicRoomSnapshot, "players" | "passwordRequired"> & {
  players: Map<string, PlayerState>;
  lastActivityAt: number;
  passwordDigest: PasswordDigest | null;
  securityVersion: number;
  reports: ReportRecord[];
  removedSessions: Map<string, { credentialHash: Buffer; until: number }>;
  serverRound: ServerButtonRound | null;
  ruleHistory: Map<string, RuleHistoryEntry[]>;
  matchScores: Map<string, number>;
  nextRoundNumber: number;
};

/** Mandatory recipient gate. Presentation concealment is never an authorization boundary. */
export function mayReceivePrivatePlayerState(player: PublicPlayer, recipientId: string) {
  return player.playerId === recipientId && player.role === "player" && player.connected;
}

/** Explicit allowlist: internal credentials, socket bindings and journals never leave the server. */
export function publicSnapshot(room: RoomState): PublicRoomSnapshot {
  return PublicRoomSnapshotSchema.parse({
    roomId: room.roomId, roomCode: room.roomCode, hostPlayerId: room.hostPlayerId,
    status: room.status, createdAt: room.createdAt, stateVersion: room.stateVersion,
    roomName: room.roomName, visibility: room.visibility, locked: room.locked,
    passwordRequired: room.passwordDigest !== null,
    publicRound: room.publicRound,
    chatMessages: room.chatMessages.map((message) => ({
      messageId: message.messageId, authorId: message.authorId, displayName: message.displayName,
      avatarId: message.avatarId, playerColor: message.playerColor, role: message.role,
      text: message.text, sentAt: message.sentAt,
    })),
    settings: {
      maxPlayers: room.settings.maxPlayers,
      roundCount: room.settings.roundCount,
      chaos: room.settings.chaos,
      buttonRoundDurationSeconds: room.settings.buttonRoundDurationSeconds,
    },
    players: [...room.players.values()].map((player) => ({
      playerId: player.playerId, displayName: player.displayName, avatarId: player.avatarId,
      ready: player.ready, connected: player.connected, joinedAt: player.joinedAt,
      isHost: player.playerId === room.hostPlayerId,
      role: player.role, playerColor: player.playerColor, afk: player.afk,
    })),
  });
}

export interface RoomOwnerOptions {
  now?: () => number;
  graceMs?: number;
  idleMs?: number;
  maxRooms?: number;
  afkMs?: number;
  buttonCountdownMs?: number;
  buttonDurationMs?: number;
  buttonResolutionMs?: number;
  buttonRechargeMs?: number;
  publish?: (state: PublicRoomSnapshot, recipients: readonly string[]) => void;
  publishPrivate?: (state: PrivatePlayerRoundState | null, recipientSocketId: string) => void;
  endSocket?: (socketId: string, error: ServerError) => void;
}

/** One synchronous mutation owner. No awaits inside room transitions. */
export class RoomOwner {
  private readonly rooms = new Map<string, RoomState>();
  private readonly codes = new Map<string, string>();
  private readonly bindings = new Map<string, { roomId: string; playerId: string }>();
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly idleMs: number;
  private readonly maxRooms: number;
  private readonly afkMs: number;
  private readonly buttonCountdownMs: number;
  private readonly buttonDurationOverrideMs: number | null;
  private readonly buttonResolutionMs: number;
  private readonly buttonRechargeMs: number;
  private readonly publish: NonNullable<RoomOwnerOptions["publish"]>;
  private readonly publishPrivate: NonNullable<RoomOwnerOptions["publishPrivate"]>;
  private readonly endSocket: NonNullable<RoomOwnerOptions["endSocket"]>;

  constructor(options: RoomOwnerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.graceMs = options.graceMs ?? 60_000;
    this.idleMs = options.idleMs ?? 7_200_000;
    this.maxRooms = options.maxRooms ?? 500;
    this.afkMs = options.afkMs ?? AFK_THRESHOLD_MS;
    this.buttonCountdownMs = options.buttonCountdownMs ?? BUTTON_COUNTDOWN_MS;
    this.buttonDurationOverrideMs = options.buttonDurationMs ?? null;
    this.buttonResolutionMs = options.buttonResolutionMs ?? BUTTON_RESOLUTION_MS;
    this.buttonRechargeMs = options.buttonRechargeMs ?? BUTTON_RECHARGE_MS;
    this.publish = options.publish ?? (() => {});
    this.publishPrivate = options.publishPrivate ?? (() => {});
    this.endSocket = options.endSocket ?? (() => {});
  }

  get roomCount() { return this.rooms.size; }
  get reportCount() { return [...this.rooms.values()].reduce((count, room) => count + room.reports.length, 0); }
  private available(socketId: string) {
    if (this.bindings.has(socketId)) throw new LobbyError("SESSION_ACTIVE");
  }
  private code() {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = "";
      for (let i = 0; i < 5; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.codes.has(code)) return code;
    }
    throw new LobbyError("SERVER_BUSY");
  }
  private activeCount(room: RoomState) { return [...room.players.values()].filter((player) => player.role === "player").length; }
  private availableColors(room: RoomState, exceptId?: string) {
    const used = new Set([...room.players.values()].filter((player) => player.playerId !== exceptId).map((player) => player.playerColor));
    return PLAYER_COLORS.filter((color) => !used.has(color));
  }
  private add(room: RoomState, socketId: string, input: CreateRoom, role: PlayerRole = "player"): SessionGrant {
    const playerId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    room.players.set(playerId, {
      playerId, displayName: input.displayName, avatarId: input.avatarId, ready: false,
      connected: true, joinedAt: this.now(), credentialHash: createHash("sha256").update(token).digest(),
      socketId, disconnectedUntil: null, requests: new Map(),
      role, playerColor: role === "player" ? this.availableColors(room).find((color) => color === input.avatarId) ?? this.availableColors(room)[0]! : null,
      afk: false, lastActivityAt: this.now(), chatTimes: [], reportsSent: [],
    });
    this.bindings.set(socketId, { roomId: room.roomId, playerId });
    this.electHost(room);
    return { roomId: room.roomId, roomCode: room.roomCode, playerId, token };
  }
  private commit(room: RoomState, touch = true) {
    if (room.publicRound) room.publicRound = {
      ...room.publicRound,
      serverNow: this.now(),
      publicTimer: room.publicRound.publicTimer ? { ...room.publicRound.publicTimer, serverNow: this.now() } : null,
      publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => ({ ...status, connected: room.players.get(status.playerId)?.connected ?? false })),
    };
    room.stateVersion++;
    if (touch) room.lastActivityAt = this.now();
    const snapshot = publicSnapshot(room);
    const recipients = [...room.players.values()].flatMap((player) => player.connected && player.socketId ? [player.socketId] : []);
    this.publish(snapshot, recipients);
    return snapshot;
  }
  private electHost(room: RoomState) {
    if (room.hostPlayerId && room.players.has(room.hostPlayerId)) return;
    // Map insertion order breaks equal joinedAt timestamps by server join order.
    room.hostPlayerId = [...room.players.values()].find((player) => player.connected && player.role === "player")?.playerId ?? null;
  }
  create(socketId: string, input: CreateRoom) {
    this.available(socketId);
    this.sweep();
    if (this.rooms.size >= this.maxRooms) throw new LobbyError("SERVER_BUSY");
    const room: RoomState = {
      roomId: randomUUID(), roomCode: this.code(), hostPlayerId: null, status: "lobby",
      players: new Map(), settings: { ...DEFAULT_ROOM_SETTINGS }, createdAt: this.now(),
      lastActivityAt: this.now(), stateVersion: 0,
      roomName: input.roomName ?? "SECRET ROOM", visibility: "private", locked: false,
      passwordDigest: null, securityVersion: 0, chatMessages: [], publicRound: null, reports: [], removedSessions: new Map(),
      serverRound: null, ruleHistory: new Map(), matchScores: new Map(), nextRoundNumber: 1,
    };
    const session = this.add(room, socketId, input);
    this.rooms.set(room.roomId, room);
    this.codes.set(room.roomCode, room.roomId);
    return { ok: true as const, session, state: this.commit(room) };
  }
  joinChallenge(socketId: string, input: JoinRoom) {
    this.available(socketId);
    this.sweep();
    const id = this.codes.get(input.roomCode);
    const room = id ? this.rooms.get(id) : undefined;
    if (!room) throw new LobbyError("ROOM_NOT_FOUND");
    if (room.status !== "lobby") throw new LobbyError("GAME_ALREADY_STARTED");
    if (room.locked) throw new LobbyError("ROOM_LOCKED");
    const active = this.activeCount(room);
    if ((input.role ?? "player") === "player" && active >= room.settings.maxPlayers) throw new LobbyError("ROOM_FULL");
    if (input.role === "spectator" && room.players.size - active >= MAX_SPECTATORS) throw new LobbyError("SPECTATORS_FULL");
    if ([...room.players.values()].some((player) => player.displayName.toLowerCase() === input.displayName.toLowerCase())) throw new LobbyError("NAME_TAKEN");
    return { roomId: room.roomId, version: room.securityVersion, digest: room.passwordDigest };
  }
  join(socketId: string, input: JoinRoom, proof?: { roomId: string; version: number }) {
    const challenge = this.joinChallenge(socketId, input);
    if (proof && (proof.roomId !== challenge.roomId || proof.version !== challenge.version)) throw new LobbyError("SECURITY_CHANGED");
    if (challenge.digest && !proof) throw new LobbyError("PASSWORD_REQUIRED");
    const room = this.rooms.get(challenge.roomId)!;
    const session = this.add(room, socketId, input, input.role ?? "player");
    return { ok: true as const, session, state: this.commit(room) };
  }
  resume(socketId: string, credential: SessionCredential) {
    const bound = this.bindings.get(socketId);
    if (bound && (bound.roomId !== credential.roomId || bound.playerId !== credential.playerId)) throw new LobbyError("SESSION_ACTIVE");
    this.sweep();
    const room = this.rooms.get(credential.roomId);
    const player = room?.players.get(credential.playerId);
    const hash = createHash("sha256").update(credential.token).digest();
    if (!room || !player) {
      const removed = room?.removedSessions.get(credential.playerId);
      if (removed && timingSafeEqual(hash, removed.credentialHash)) throw new LobbyError("PLAYER_REMOVED");
      throw new LobbyError("INVALID_SESSION");
    }
    if (!timingSafeEqual(hash, player.credentialHash)) throw new LobbyError("INVALID_SESSION");
    if (player.disconnectedUntil !== null && player.disconnectedUntil <= this.now()) throw new LobbyError("SESSION_EXPIRED");
    if (player.socketId !== socketId || !player.connected) {
      if (player.socketId) {
        const previousSocket = player.socketId;
        this.bindings.delete(previousSocket);
        // Remove authority before a transport callback can fire disconnect.
        player.socketId = null;
        this.endSocket(previousSocket, protocolError("SESSION_REPLACED"));
      }
      player.socketId = socketId;
      player.connected = true;
      player.disconnectedUntil = null;
      this.markActivity(player);
      this.bindings.set(socketId, { roomId: room.roomId, playerId: player.playerId });
      this.electHost(room);
      this.commit(room);
    }
    this.deliverPrivate(socketId, room.roomId);
    return { ok: true as const, session: { ...credential, roomCode: room.roomCode }, state: publicSnapshot(room) };
  }
  private member(socketId: string, expectedRoomId: string) {
    const binding = this.bindings.get(socketId);
    const room = binding ? this.rooms.get(binding.roomId) : undefined;
    const player = binding ? room?.players.get(binding.playerId) : undefined;
    if (!room || room.roomId !== expectedRoomId || !player || !player.connected || player.socketId !== socketId) throw new LobbyError("INVALID_SESSION");
    if (this.now() - room.lastActivityAt >= this.idleMs) { this.destroy(room); throw new LobbyError("ROOM_EXPIRED"); }
    return { room, player };
  }
  private mutate(socketId: string, roomId: string, requestId: string, signature: string, action: (room: RoomState, player: PlayerState) => boolean, allowedStatuses: readonly RoomState["status"][] = ["lobby"]) {
    const { room, player } = this.member(socketId, roomId);
    if (!allowedStatuses.includes(room.status)) throw new LobbyError("GAME_ALREADY_STARTED");
    signature = createHash("sha256").update(signature).digest("hex");
    const previous = player.requests.get(requestId);
    if (previous !== undefined) {
      if (previous !== signature) throw new LobbyError("REQUEST_CONFLICT");
      return { ok: true as const, state: publicSnapshot(room) };
    }
    const changed = action(room, player);
    const wasAfk = this.markActivity(player);
    player.requests.set(requestId, signature);
    if (player.requests.size > 128) { const oldest = player.requests.keys().next().value; if (oldest) player.requests.delete(oldest); }
    return { ok: true as const, state: changed || wasAfk ? this.commit(room) : publicSnapshot(room) };
  }
  setReady(socketId: string, input: SetReady) {
    return this.mutate(socketId, input.roomId, input.requestId, `ready:${input.ready}`, (_room, player) => {
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      if (player.ready === input.ready) return false;
      player.ready = input.ready;
      return true;
    });
  }
  updateSettings(socketId: string, input: UpdateSettings) {
    return this.mutate(socketId, input.roomId, input.requestId, `settings:${JSON.stringify(input.settings)}`, (room, player) => {
      if (room.hostPlayerId !== player.playerId) throw new LobbyError("NOT_HOST");
      if (input.settings.maxPlayers < this.activeCount(room)) throw new LobbyError("SETTINGS_CONFLICT");
      if (JSON.stringify(room.settings) === JSON.stringify(input.settings)) return false;
      room.settings = { ...input.settings };
      return true;
    });
  }
  private markActivity(player: PlayerState) {
    const changed = player.afk;
    player.lastActivityAt = this.now();
    player.afk = false;
    return changed;
  }
  private host(room: RoomState, player: PlayerState) {
    if (room.hostPlayerId !== player.playerId || player.role !== "player") throw new LobbyError("NOT_HOST");
  }
  private target(room: RoomState, player: PlayerState, targetId: string) {
    const target = room.players.get(targetId);
    if (!target || target.playerId === player.playerId) throw new LobbyError("INVALID_TARGET");
    return target;
  }
  private command<K extends StateCommandName>(socketId: string, event: K, input: StateCommandPayload<K>, action: (room: RoomState, player: PlayerState) => boolean, allowedStatuses?: readonly RoomState["status"][]) {
    return this.mutate(socketId, input.roomId, input.requestId, `${event}:${JSON.stringify(input)}`, action, allowedStatuses);
  }
  setVisibility(socketId: string, input: StateCommandPayload<typeof EVENTS.visibility>) {
    return this.command(socketId, EVENTS.visibility, input, (room, player) => {
      this.host(room, player);
      if (room.visibility === input.visibility) return false;
      room.visibility = input.visibility;
      return true;
    });
  }
  setLock(socketId: string, input: StateCommandPayload<typeof EVENTS.lock>) {
    return this.command(socketId, EVENTS.lock, input, (room, player) => {
      this.host(room, player);
      if (room.locked === input.locked) return false;
      room.locked = input.locked;
      return true;
    });
  }
  setName(socketId: string, input: StateCommandPayload<typeof EVENTS.name>) {
    return this.command(socketId, EVENTS.name, input, (room, player) => {
      this.host(room, player);
      if (room.roomName === input.roomName) return false;
      room.roomName = input.roomName;
      return true;
    });
  }
  passwordRevision(socketId: string, roomId: string) {
    const { room, player } = this.member(socketId, roomId);
    this.host(room, player);
    if (room.status !== "lobby") throw new LobbyError("GAME_ALREADY_STARTED");
    return room.securityVersion;
  }
  setPassword(socketId: string, input: StateCommandPayload<typeof EVENTS.password>, digest: PasswordDigest | null, expectedVersion: number) {
    return this.command(socketId, EVENTS.password, input, (room, player) => {
      this.host(room, player);
      if (room.securityVersion !== expectedVersion) throw new LobbyError("SECURITY_CHANGED");
      if (input.enabled && digest === null) throw new LobbyError("INVALID_PASSWORD");
      if (!input.enabled && room.passwordDigest === null) return false;
      room.passwordDigest = input.enabled ? digest : null;
      room.securityVersion++;
      return true;
    });
  }
  kick(socketId: string, input: StateCommandPayload<typeof EVENTS.kick>) {
    return this.command(socketId, EVENTS.kick, input, (room, player) => {
      this.host(room, player);
      const target = this.target(room, player, input.targetPlayerId);
      room.players.delete(target.playerId);
      room.removedSessions.set(target.playerId, { credentialHash: target.credentialHash, until: this.now() + 600_000 });
      if (room.removedSessions.size > 128) room.removedSessions.delete(room.removedSessions.keys().next().value!);
      if (target.socketId) {
        this.bindings.delete(target.socketId);
        this.endSocket(target.socketId, protocolError("PLAYER_REMOVED"));
      }
      return true;
    });
  }
  transferHost(socketId: string, input: StateCommandPayload<typeof EVENTS.transfer>) {
    return this.command(socketId, EVENTS.transfer, input, (room, player) => {
      this.host(room, player);
      if (room.status === "in_game" && !room.publicRound?.phase.match(/^(reveal|match_complete)$/)) throw new LobbyError("INVALID_GAME_PHASE");
      const target = this.target(room, player, input.targetPlayerId);
      if (!target.connected || target.role !== "player") throw new LobbyError("INVALID_TARGET");
      room.hostPlayerId = target.playerId;
      return true;
    }, ["lobby", "in_game"]);
  }
  setAvatar(socketId: string, input: StateCommandPayload<typeof EVENTS.avatar>) {
    return this.command(socketId, EVENTS.avatar, input, (_room, player) => {
      if (player.avatarId === input.avatarId) return false;
      player.avatarId = input.avatarId;
      return true;
    });
  }
  setColor(socketId: string, input: StateCommandPayload<typeof EVENTS.color>) {
    return this.command(socketId, EVENTS.color, input, (room, player) => {
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      if (!this.availableColors(room, player.playerId).includes(input.playerColor)) throw new LobbyError("COLOR_UNAVAILABLE");
      if (player.playerColor === input.playerColor) return false;
      player.playerColor = input.playerColor;
      return true;
    });
  }
  randomizeAvatar(socketId: string, input: RoomRequest) {
    return this.command(socketId, EVENTS.randomize, input, (room, player) => {
      const avatars: AvatarId[] = AVATAR_IDS.filter((id) => id !== player.avatarId);
      player.avatarId = avatars[randomInt(avatars.length)]!;
      if (player.role === "player") {
        const available = this.availableColors(room, player.playerId);
        const alternatives = available.filter((color) => color !== player.playerColor);
        const colors: PlayerColor[] = alternatives.length ? alternatives : available;
        player.playerColor = colors[randomInt(colors.length)]!;
      }
      return true;
    });
  }
  setRole(socketId: string, input: StateCommandPayload<typeof EVENTS.role>) {
    return this.command(socketId, EVENTS.role, input, (room, player) => {
      if (player.role === input.role) return false;
      if (room.hostPlayerId === player.playerId) throw new LobbyError("HOST_MUST_TRANSFER");
      const active = this.activeCount(room);
      if (input.role === "player" && active >= room.settings.maxPlayers) throw new LobbyError("ROOM_FULL");
      if (input.role === "spectator" && room.players.size - active >= MAX_SPECTATORS) throw new LobbyError("SPECTATORS_FULL");
      player.role = input.role;
      player.ready = false;
      player.playerColor = input.role === "player" ? this.availableColors(room, player.playerId)[0]! : null;
      this.electHost(room);
      return true;
    });
  }
  activity(socketId: string, input: RoomRequest) {
    return this.command(socketId, EVENTS.activity, input, () => false, ["lobby", "in_game"]);
  }
  sendChat(socketId: string, input: StateCommandPayload<typeof EVENTS.chat>) {
    return this.command(socketId, EVENTS.chat, input, (room, player) => {
      const recent = player.chatTimes.filter((at) => this.now() - at < 10_000);
      if (recent.length >= 5) throw new LobbyError("RATE_LIMITED");
      player.chatTimes = [...recent, this.now()];
      room.chatMessages.push({ messageId: randomUUID(), authorId: player.playerId, displayName: player.displayName,
        avatarId: player.avatarId, playerColor: player.playerColor, role: player.role, text: input.text, sentAt: this.now() });
      if (room.chatMessages.length > MAX_CHAT_MESSAGES) room.chatMessages.shift();
      return true;
    }, ["lobby", "in_game"]);
  }
  reportPlayer(socketId: string, input: StateCommandPayload<typeof EVENTS.report>) {
    return this.command(socketId, EVENTS.report, input, (room, player) => {
      const target = this.target(room, player, input.targetPlayerId);
      const recent = player.reportsSent.filter((entry) => this.now() - entry.at < 600_000);
      if (recent.some((entry) => entry.targetId === target.playerId)) throw new LobbyError("REPORT_ALREADY_SENT");
      if (recent.length >= 3) throw new LobbyError("RATE_LIMITED");
      player.reportsSent = [...recent, { targetId: target.playerId, at: this.now() }];
      room.reports.push({ reportId: randomUUID(), reporterId: player.playerId, targetId: target.playerId,
        reason: input.reason, description: input.description, createdAt: this.now() });
      if (room.reports.length > 50) room.reports.shift();
      return false; // Report details and reporter identity never become a room broadcast.
    }, ["lobby", "in_game"]);
  }
  private prepareButtonRound(room: RoomState) {
    const active = [...room.players.values()].filter((candidate) => candidate.role === "player");
    if (active.length < 4 || active.length > 10) throw new LobbyError("NOT_READY");
    const preparedAt = this.now();
    const seed = randomBytes(24).toString("base64url");
    const generated = generateRuleSet({
      seed, roundNumber: room.nextRoundNumber, miniGameId: THE_BUTTON_MINI_GAME.id,
      players: active.map((candidate) => ({ playerId: candidate.playerId, displayName: candidate.displayName, isHost: candidate.playerId === room.hostPlayerId })),
      settings: room.settings, capabilities: THE_BUTTON_MINI_GAME.capabilities, history: room.ruleHistory,
      buttonMode: CLASSIC_BUTTON_MODE,
    });
    for (const candidate of active) if (!room.matchScores.has(candidate.playerId)) room.matchScores.set(candidate.playerId, 0);
    appendRuleHistory(room.ruleHistory, generated.historyEntries);
    const roundId = generated.assignments.values().next().value!.roundId;
    const observableEvents = initializeButtonEvents(active.map((candidate) => candidate.playerId), preparedAt);
    const durationMs = this.buttonDurationOverrideMs ?? room.settings.buttonRoundDurationSeconds * 1000;
    room.serverRound = {
      ...generated, phase: "waiting_for_rule_ack", counter: 0, countdownEndsAt: null, deadlineAt: null,
      durationMs,
      resolutionEndsAt: null, outcome: "pending", pressHistory: [], observableEvents,
      rechargeEndsAt: null, lastNormalActorPlayerId: null,
      buttonEvents: [], timerThresholdEmitted: false,
      participantNames: new Map(active.map((candidate) => [candidate.playerId, candidate.displayName])),
    };
    room.publicRound = {
      roundId, roundNumber: room.nextRoundNumber, totalRounds: room.settings.roundCount,
      miniGameId: THE_BUTTON_MINI_GAME.id, buttonMode: CLASSIC_BUTTON_MODE, phase: "waiting_for_rule_ack", serverNow: preparedAt, publicObjective: THE_BUTTON_MINI_GAME.publicObjective,
      publicTimer: null, countdownEndsAt: null,
      publicGameState: { kind: "the-button", counter: 0, target: BUTTON_TARGET, locked: true, outcome: "pending", lastDelta: null, rechargeEndsAt: null, lastNormalActorPlayerId: null },
      publicActions: [], publicPlayerStatuses: active.map((candidate) => ({ playerId: candidate.playerId, connected: candidate.connected, acknowledged: false })),
      publicEvents: [{ eventId: randomUUID(), type: "ROUND_PREPARED", at: preparedAt }], reveal: null,
      scores: rankedStandings(room.matchScores), roundScore: null, matchResult: null,
    };
    room.nextRoundNumber++;
    room.status = "in_game";
  }
  startGame(socketId: string, input: StateCommandPayload<typeof EVENTS.startGame>) {
    const result = this.command(socketId, EVENTS.startGame, input, (room, player) => {
      this.host(room, player);
      const active = [...room.players.values()].filter((candidate) => candidate.role === "player");
      if (active.length < 4 || active.length > 10 || active.some((candidate) => !candidate.connected || !candidate.ready)) throw new LobbyError("NOT_READY");
      this.prepareButtonRound(room);
      return true;
    });
    const room = this.member(socketId, input.roomId).room;
    this.deliverAllPrivate(room);
    return result;
  }
  acknowledgeRule(socketId: string, input: StateCommandPayload<typeof EVENTS.acknowledgeRule>) {
    const result = this.command(socketId, EVENTS.acknowledgeRule, input, (room, player) => {
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      const serverRound = room.serverRound;
      const privateState = serverRound?.assignments.get(player.playerId);
      if (!serverRound || !privateState || !room.publicRound) throw new LobbyError("ROUND_NOT_PREPARED");
      if (serverRound.phase !== "waiting_for_rule_ack") throw new LobbyError("INVALID_GAME_PHASE");
      if (privateState.acknowledgedAt !== null) return false;
      const acknowledgedAt = this.now();
      const assignments = new Map(serverRound.assignments);
      assignments.set(player.playerId, { ...privateState, acknowledgedAt });
      room.serverRound = { ...serverRound, assignments };
      room.publicRound = { ...room.publicRound,
        publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === player.playerId ? { ...status, acknowledged: true } : status),
        publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "PLAYER_ACKNOWLEDGED", at: acknowledgedAt, playerId: player.playerId }],
      };
      if (room.publicRound.publicPlayerStatuses.every((status) => status.acknowledged)) {
        const countdownEndsAt = acknowledgedAt + this.buttonCountdownMs;
        room.serverRound = { ...room.serverRound, phase: "countdown", countdownEndsAt };
        room.publicRound = {
          ...room.publicRound, phase: "countdown", countdownEndsAt,
          publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "COUNTDOWN_STARTED", at: acknowledgedAt }],
        };
      }
      return true;
    }, ["in_game"]);
    const privateState = this.privateState(socketId, input.roomId);
    if (privateState) this.publishPrivate(privateState, socketId);
    return result;
  }
  pressButton(socketId: string, input: StateCommandPayload<typeof EVENTS.buttonPress>) {
    const result = this.command(socketId, EVENTS.buttonPress, input, (room, player) => {
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "playing" || room.publicRound.phase !== "playing") throw new LobbyError("INVALID_GAME_PHASE");
      const pressedAt = this.now();
      if (room.serverRound.lastNormalActorPlayerId === player.playerId) throw new LobbyError("BUTTON_REPEAT_LOCKED");
      if (room.serverRound.rechargeEndsAt !== null && pressedAt < room.serverRound.rechargeEndsAt) throw new LobbyError("BUTTON_RECHARGING");
      const resolution = resolveButtonPress(room.serverRound.assignments, player.playerId);
      const previousValue = room.serverRound.counter;
      const currentValue = previousValue + resolution.delta;
      const record: ButtonPressRecord = {
        actionId: input.requestId, actorPlayerId: player.playerId, previousValue, currentValue,
        delta: resolution.delta, at: pressedAt, sequence: room.serverRound.pressHistory.length + 1,
        serverOnlyModifiers: resolution.modifiers,
      };
      const observableEvents = [...room.serverRound.observableEvents, ...pressEvents(record)];
      const generated = updateButtonAssignments({ ...room.serverRound, assignments: resolution.assignments }, observableEvents);
      const rechargeEndsAt = pressedAt + this.buttonRechargeMs;
      room.serverRound = { ...room.serverRound, ...generated, counter: currentValue, pressHistory: [...room.serverRound.pressHistory, record], observableEvents,
        rechargeEndsAt, lastNormalActorPlayerId: player.playerId,
        buttonEvents: [...room.serverRound.buttonEvents, ...buttonGameEventsForPress(record)] };
      room.publicRound = {
        ...room.publicRound,
        publicGameState: { ...room.publicRound.publicGameState, counter: currentValue, lastDelta: resolution.delta, rechargeEndsAt, lastNormalActorPlayerId: player.playerId },
        publicActions: [...room.publicRound.publicActions, ...sanitizedAction(record)].slice(-100),
        publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "BUTTON_PRESS_RESOLVED" as const, at: record.at, playerId: player.playerId }].slice(-100),
      };
      const outcome = buttonOutcomeForCounter(currentValue);
      if (outcome !== "pending") this.resolveRound(room, outcome);
      return true;
    }, ["in_game"]);
    const room = this.member(socketId, input.roomId).room;
    this.deliverAllPrivate(room);
    return result;
  }
  continueRound(socketId: string, input: StateCommandPayload<typeof EVENTS.continueRound>) {
    const result = this.command(socketId, EVENTS.continueRound, input, (room, player) => {
      this.host(room, player);
      if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "reveal") throw new LobbyError("INVALID_GAME_PHASE");
      if (room.publicRound.roundNumber >= room.settings.roundCount) throw new LobbyError("INVALID_GAME_PHASE");
      this.clearPrivateDeliveries(room);
      this.prepareButtonRound(room);
      return true;
    }, ["in_game"]);
    const room = this.member(socketId, input.roomId).room;
    this.deliverAllPrivate(room);
    return result;
  }
  returnToLobby(socketId: string, input: StateCommandPayload<typeof EVENTS.returnToLobby>) {
    return this.command(socketId, EVENTS.returnToLobby, input, (room, player) => {
      this.host(room, player);
      if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "match_complete" || room.publicRound.phase !== "match_complete") {
        throw new LobbyError("INVALID_GAME_PHASE");
      }
      this.clearPrivateDeliveries(room);
      room.serverRound = null;
      room.publicRound = null;
      room.status = "lobby";
      room.nextRoundNumber = 1;
      room.matchScores.clear();
      room.ruleHistory.clear();
      for (const member of room.players.values()) {
        member.ready = false;
        member.afk = false;
      }
      return true;
    }, ["in_game"]);
  }
  private resolveRound(room: RoomState, outcome: Exclude<ButtonOutcome, "pending">) {
    if (!room.serverRound || !room.publicRound || !["playing"].includes(room.serverRound.phase)) return;
    const resolvedAt = this.now();
    const finalized = finalizeButtonAssignments(room.serverRound, room.serverRound.observableEvents, resolvedAt);
    const buttonEvents: ButtonGameEvent[] = outcome === "timeout"
      ? [...room.serverRound.buttonEvents, { type: "ROUND_TIMEOUT", value: room.serverRound.counter, at: resolvedAt }]
      : room.serverRound.buttonEvents;
    room.serverRound = {
      ...room.serverRound, ...finalized.generated, observableEvents: finalized.events,
      phase: "resolving", deadlineAt: null, resolutionEndsAt: resolvedAt + this.buttonResolutionMs, outcome,
      buttonEvents,
    };
    room.publicRound = {
      ...room.publicRound, phase: "resolving", publicTimer: null, countdownEndsAt: null,
      publicGameState: { ...room.publicRound.publicGameState, locked: true, outcome, rechargeEndsAt: null },
      publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "ROUND_RESOLVED" as const, at: resolvedAt }].slice(-100),
    };
  }
  private revealRound(room: RoomState) {
    if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "resolving") return;
    const revealedAt = this.now();
    const entries = [...room.serverRound.assignments.values()].map((state) => {
      const used = state.hiddenAbilities.length > 0 && state.hiddenAbilities.every((ability) => ability.usesRemaining === 0);
      const status = state.secretRule.category === "private_knowledge" ? "information_only" as const
        : state.secretRule.category === "hidden_ability" ? (used ? "ability_used" as const : "ability_unused" as const)
          : state.privateProgress.status === "completed" ? "completed" as const : "failed" as const;
      return {
        playerId: state.playerId, displayName: room.serverRound!.participantNames.get(state.playerId) ?? "DEPARTED PLAYER",
        publicRuleDescription: state.secretRule.description, status, progressSummary: state.privateProgress.summary,
      };
    });
    const relationshipHighlights = room.serverRound.relationshipGraph.edges
      .filter((edge) => edge.type !== "NEUTRAL")
      .slice(0, 30)
      .map(({ fromPlayerId, toPlayerId, type }) => ({ fromPlayerId, toPlayerId, type }));
    const scored = scoreRound({
      roundNumber: room.publicRound.roundNumber,
      assignments: room.serverRound.assignments,
      previousScores: room.matchScores,
      publicChallengeSucceeded: room.serverRound.outcome === "success",
      wildBonusEligible: buttonRuleHasWildScoreBonus,
    });
    room.matchScores = scored.nextScores;
    const finalRound = room.publicRound.roundNumber >= room.publicRound.totalRounds;
    const phase = finalRound ? "match_complete" as const : "reveal" as const;
    const matchResult = finalRound ? {
      completedRounds: room.publicRound.roundNumber,
      totalRounds: room.publicRound.totalRounds,
      winnerPlayerIds: winners(scored.roundScore.standings),
      finalStandings: scored.roundScore.standings,
    } : null;
    room.serverRound = { ...room.serverRound, phase, resolutionEndsAt: null };
    room.publicRound = {
      ...room.publicRound, phase, reveal: { roundId: room.publicRound.roundId, entries, relationshipHighlights },
      scores: scored.roundScore.standings, roundScore: scored.roundScore, matchResult,
      publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "REVEAL_STARTED" as const, at: revealedAt }].slice(-100),
    };
  }
  private advanceRound(room: RoomState) {
    if (!room.serverRound || !room.publicRound) return false;
    const now = this.now();
    if (room.serverRound.phase === "countdown" && room.serverRound.countdownEndsAt !== null && now >= room.serverRound.countdownEndsAt) {
      const deadlineAt = now + room.serverRound.durationMs;
      room.serverRound = { ...room.serverRound, phase: "playing", countdownEndsAt: null, deadlineAt };
      room.publicRound = {
        ...room.publicRound, phase: "playing", countdownEndsAt: null,
        publicTimer: { deadlineAt, durationMs: room.serverRound.durationMs, serverNow: now },
        publicGameState: { ...room.publicRound.publicGameState, locked: false },
        publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "ROUND_STARTED" as const, at: now }].slice(-100),
      };
      return true;
    }
    if (room.serverRound.phase === "playing" && room.serverRound.deadlineAt !== null && now >= room.serverRound.deadlineAt) {
      this.resolveRound(room, "timeout");
      this.deliverAllPrivate(room);
      return true;
    }
    if (room.serverRound.phase === "playing" && room.serverRound.deadlineAt !== null && !room.serverRound.timerThresholdEmitted && room.serverRound.deadlineAt - now <= 10_000) {
      const remainingMs = Math.max(0, room.serverRound.deadlineAt - now);
      room.serverRound = {
        ...room.serverRound, timerThresholdEmitted: true,
        buttonEvents: [...room.serverRound.buttonEvents, { type: "TIMER_THRESHOLD_REACHED", remainingMs, at: now }],
        observableEvents: [...room.serverRound.observableEvents, { type: "TIMER_THRESHOLD", remainingMs, at: now }],
      };
      return true;
    }
    if (room.serverRound.phase === "resolving" && room.serverRound.resolutionEndsAt !== null && now >= room.serverRound.resolutionEndsAt) {
      this.revealRound(room);
      return true;
    }
    return false;
  }
  privateState(socketId: string, roomId: string) {
    const { room, player } = this.member(socketId, roomId);
    if (!mayReceivePrivatePlayerState({ ...player, isHost: player.playerId === room.hostPlayerId }, player.playerId)) return null;
    const state = room.serverRound?.assignments.get(player.playerId) ?? null;
    return state?.playerId === player.playerId ? state : null;
  }
  deliverPrivate(socketId: string, roomId: string) {
    const state = this.privateState(socketId, roomId);
    if (state) this.publishPrivate(state, socketId);
  }
  private deliverAllPrivate(room: RoomState) {
    for (const player of room.players.values()) {
      if (!player.socketId || !player.connected || player.role !== "player") continue;
      const state = room.serverRound?.assignments.get(player.playerId);
      if (state?.playerId === player.playerId) this.publishPrivate(state, player.socketId);
    }
  }
  private clearPrivateDeliveries(room: RoomState) {
    for (const player of room.players.values()) if (player.socketId && player.connected && player.role === "player") this.publishPrivate(null, player.socketId);
  }
  private handleRoundDeparture(room: RoomState, playerId: string) {
    if (!room.serverRound || !room.publicRound) return;
    room.publicRound = {
      ...room.publicRound,
      publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === playerId ? { ...status, connected: false, acknowledged: true } : status),
    };
    if (room.serverRound.phase === "waiting_for_rule_ack" && room.publicRound.publicPlayerStatuses.every((status) => status.acknowledged)) {
      const countdownEndsAt = this.now() + this.buttonCountdownMs;
      room.serverRound = { ...room.serverRound, phase: "countdown", countdownEndsAt };
      room.publicRound = { ...room.publicRound, phase: "countdown", countdownEndsAt,
        publicEvents: [...room.publicRound.publicEvents, { eventId: randomUUID(), type: "COUNTDOWN_STARTED", at: this.now() }] };
    }
  }
  requestState(socketId: string, roomId: string) {
    const room = this.member(socketId, roomId).room;
    this.deliverPrivate(socketId, roomId);
    return { ok: true as const, state: publicSnapshot(room) };
  }
  disconnect(socketId: string) {
    const binding = this.bindings.get(socketId);
    this.bindings.delete(socketId);
    const room = binding ? this.rooms.get(binding.roomId) : undefined;
    const player = binding ? room?.players.get(binding.playerId) : undefined;
    if (!room || !player || player.socketId !== socketId) return;
    player.connected = false;
    player.afk = false;
    player.socketId = null;
    player.disconnectedUntil = this.now() + this.graceMs;
    this.commit(room);
  }
  leave(socketId: string, roomId: string) {
    const { room, player } = this.member(socketId, roomId);
    this.bindings.delete(socketId);
    if (player.role === "player") this.handleRoundDeparture(room, player.playerId);
    room.players.delete(player.playerId);
    this.finishRemoval(room);
    return { ok: true as const };
  }
  private finishRemoval(room: RoomState) {
    if (room.players.size === 0) { this.destroy(room); return; }
    this.electHost(room);
    this.commit(room);
  }
  private destroy(room: RoomState) {
    this.rooms.delete(room.roomId);
    this.codes.delete(room.roomCode);
    for (const player of room.players.values()) {
      if (player.socketId) {
        this.bindings.delete(player.socketId);
        this.endSocket(player.socketId, protocolError("ROOM_EXPIRED"));
      }
    }
    room.players.clear();
    room.chatMessages.length = 0;
    room.reports.length = 0;
    room.serverRound = null;
    room.publicRound = null;
    room.ruleHistory.clear();
    room.matchScores.clear();
    room.removedSessions.clear();
  }
  sweep() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (now - room.lastActivityAt >= this.idleMs) { this.destroy(room); continue; }
      const roundChanged = this.advanceRound(room);
      let removed = false;
      let presenceChanged = false;
      for (const player of room.players.values()) {
        if (!player.connected && player.disconnectedUntil !== null && player.disconnectedUntil <= now) {
          if (player.role === "player") this.handleRoundDeparture(room, player.playerId);
          room.players.delete(player.playerId);
          removed = true;
        }
        if (player.connected && !player.afk && now - player.lastActivityAt >= this.afkMs) {
          player.afk = true;
          presenceChanged = true;
        }
      }
      for (const [id, entry] of room.removedSessions) if (entry.until <= now) room.removedSessions.delete(id);
      if (removed) this.finishRemoval(room);
      else if (presenceChanged || roundChanged) this.commit(room, false);
    }
  }
  dispose() { this.bindings.clear(); this.codes.clear(); this.rooms.clear(); }
}
