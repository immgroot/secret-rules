import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_ROOM_SETTINGS, ROOM_CODE_ALPHABET, PublicRoomSnapshotSchema, protocolError,
  AVATAR_IDS, PLAYER_COLORS, MAX_SPECTATORS, MAX_CHAT_MESSAGES, AFK_THRESHOLD_MS, EVENTS,
  type CreateRoom, type JoinRoom, type PublicPlayer, type PublicRoomSnapshot,
  type SessionCredential, type SessionGrant, type ServerError, type ErrorCode,
  type SetReady, type UpdateSettings, type PlayerRole, type PlayerColor, type AvatarId,
  type StateCommandName, type StateCommandPayload, type RoomRequest, type ReportReason,
  effectiveDeckSize, recommendedButtonTarget, minimumCustomDeckSize, isTargetedButtonCard,
  type PrivatePlayerRoundState, type ObservableGameEvent, type RoundPhase, type ButtonCard,
  type ButtonCardKind, type ButtonDirection, type ButtonVoteChoice, type PublicRoundEvent,
  type PublicButtonEffect, type WildMovement,
} from "@secret-rules/shared";
import type { PasswordDigest } from "./passwords.ts";
import { appendRuleHistory, THE_BUTTON_MINI_GAME, generateRuleSet, type GeneratedRuleSet } from "../rules/engine.ts";
import type { RandomSource, RuleHistoryEntry } from "../rules/types.ts";
import { BUTTON_CHALLENGE_REVEAL_MS, BUTTON_COUNTDOWN_MS, applyButtonMovement, basicButtonAvailable, movementForCard } from "../games/button/engine.ts";
import { buildButtonDeck, buttonDeckKindCounts } from "../games/button/deck.ts";
import { evaluateButtonAssignments } from "../games/button/evaluator.ts";
import { BUTTON_V2_MODE } from "../games/button/modes.ts";
import { applyScoreDelta, createRoundLedger, rankedStandings, scoreButtonV2Round, winners, type PlayerRoundLedger } from "../scoring/engine.ts";
import { SCORING_CONFIG } from "../scoring/config.ts";
import { seededRandom } from "../rules/rng.ts";

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
type PendingPlay = {
  card: ButtonCard; actorPlayerId: string; claim: ButtonCardKind; targetPlayerId: string | null; submittedAt: number;
  challengerPlayerId: string | null; challengeOutcome: "bluff_caught" | "false_accusation" | null;
  cancelled: boolean; penaltyPlayerId: string | null; challengeResolvedAt: number | null; revealEndsAt: number | null;
};
type ServerButtonRound = Omit<GeneratedRuleSet, "assignments"> & {
  assignments: Map<string, PrivatePlayerRoundState>;
  phase: RoundPhase; seed: string; participantOrder: string[]; departedPlayerIds: Set<string>;
  participantNames: ReadonlyMap<string, string>; deck: ButtonCard[]; discard: ButtonCard[];
  counter: number; target: number; direction: ButtonDirection; currentIndex: number; currentPlayerId: string | null;
  countdownEndsAt: number | null; deadlineAt: number | null; played: PendingPlay | null;
  shieldedPlayerIds: Set<string>; skippedTurns: Map<string, number>; targetSecured: boolean; securedByPlayerId: string | null;
  votes: Map<string, ButtonVoteChoice>; voteResult: ButtonVoteChoice | null; voteTieBroken: boolean;
  lastChanceRemaining: Set<string> | null; lastChanceStartsAt: number | null;
  observableEvents: ObservableGameEvent[]; ledgers: Map<string, PlayerRoundLedger>; lastEffect: PublicButtonEffect | null;
  random: RandomSource;
};

function roundEvent(type: PublicRoundEvent["type"], at: number, fields: Partial<Pick<PublicRoundEvent, "actorPlayerId" | "targetPlayerId" | "claim" | "revealedCard" | "movement">> = {}): PublicRoundEvent {
  return { eventId: randomUUID(), type, at, actorPlayerId: fields.actorPlayerId ?? null, targetPlayerId: fields.targetPlayerId ?? null, claim: fields.claim ?? null, revealedCard: fields.revealedCard ?? null, movement: fields.movement ?? null };
}
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
      buttonDeckPreset: room.settings.buttonDeckPreset,
      buttonCustomDeckSize: room.settings.buttonCustomDeckSize,
      buttonTarget: room.settings.buttonTarget,
      turnTimerSeconds: room.settings.turnTimerSeconds,
      challengeTimerSeconds: room.settings.challengeTimerSeconds,
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
  turnTimerMs?: number;
  challengeTimerMs?: number;
  challengeRevealMs?: number;
  roundSeed?: (roomId: string, roundNumber: number) => string;
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
  private readonly turnTimerOverrideMs: number | null;
  private readonly challengeTimerOverrideMs: number | null;
  private readonly challengeRevealMs: number;
  private readonly roundSeed: NonNullable<RoomOwnerOptions["roundSeed"]>;
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
    this.turnTimerOverrideMs = options.turnTimerMs ?? null;
    this.challengeTimerOverrideMs = options.challengeTimerMs ?? null;
    this.challengeRevealMs = options.challengeRevealMs ?? BUTTON_CHALLENGE_REVEAL_MS;
    this.roundSeed = options.roundSeed ?? (() => randomBytes(24).toString("base64url"));
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
      if (room.publicRound) room.publicRound = { ...room.publicRound, publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === player.playerId ? { ...status, connected: true } : status) };
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
      if (input.settings.buttonDeckPreset === "custom" && input.settings.buttonCustomDeckSize < minimumCustomDeckSize(this.activeCount(room))) throw new LobbyError("SETTINGS_CONFLICT");
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
      if (room.status === "in_game" && !room.publicRound?.phase.match(/^(round_reveal|match_complete)$/)) throw new LobbyError("INVALID_GAME_PHASE");
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
  private turnDurationMs(room: RoomState) { return this.turnTimerOverrideMs ?? room.settings.turnTimerSeconds * 1000; }
  private challengeDurationMs(room: RoomState) { return this.challengeTimerOverrideMs ?? room.settings.challengeTimerSeconds * 1000; }
  private eligibleRoundPlayerIds(room: RoomState) {
    const round = room.serverRound;
    return round ? round.participantOrder.filter((id) => !round.departedPlayerIds.has(id) && room.players.get(id)?.role === "player") : [];
  }
  private bumpPrivate(round: ServerButtonRound, playerId: string, change: (state: PrivatePlayerRoundState) => PrivatePlayerRoundState) {
    const current = round.assignments.get(playerId);
    if (!current) throw new LobbyError("PLAYER_NOT_FOUND");
    const changed = change(current);
    round.assignments.set(playerId, { ...changed, revision: current.revision + 1 });
  }
  private appendPublicEvent(room: RoomState, event: PublicRoundEvent) {
    if (room.publicRound) room.publicRound = { ...room.publicRound, publicEvents: [...room.publicRound.publicEvents, event].slice(-100) };
  }
  private evaluateSecrets(room: RoomState) {
    const round = room.serverRound;
    if (!round) return;
    round.assignments = evaluateButtonAssignments(round.assignments, round.observableEvents);
  }
  private syncButtonPublic(room: RoomState) {
    const round = room.serverRound;
    const current = room.publicRound;
    if (!round || !current) return;
    const timerKind = round.phase === "turn_action" ? "turn" as const : round.phase === "challenge" ? "challenge" as const : round.phase === "target_vote" ? "vote" as const : null;
    const timer = timerKind && round.deadlineAt !== null ? { kind: timerKind, deadlineAt: round.deadlineAt, durationMs: timerKind === "challenge" ? this.challengeDurationMs(room) : this.turnDurationMs(room), serverNow: this.now() } : null;
    const played = round.played;
    const eligible = this.eligibleRoundPlayerIds(room);
    const currentHand = round.currentPlayerId ? round.assignments.get(round.currentPlayerId)?.hand.length ?? 0 : 0;
    room.publicRound = {
      ...current,
      serverNow: this.now(),
      phase: round.phase,
      publicTimer: timer,
      countdownEndsAt: round.countdownEndsAt,
      scores: rankedStandings(room.matchScores),
      publicGameState: {
        kind: "the-button-v2",
        counter: round.counter,
        target: round.target,
        targetSecured: round.targetSecured,
        securedByPlayerId: round.securedByPlayerId,
        currentPlayerId: round.currentPlayerId,
        direction: round.direction,
        deckRemaining: round.deck.length,
        discardCount: round.discard.length,
        handCounts: round.participantOrder.map((playerId) => ({ playerId, count: round.assignments.get(playerId)?.hand.length ?? 0 })),
        shieldedPlayerIds: [...round.shieldedPlayerIds],
        skippedPlayerIds: [...round.skippedTurns].filter(([, count]) => count > 0).map(([playerId]) => playerId),
        currentClaim: played ? { actorPlayerId: played.actorPlayerId, claim: played.claim, targetPlayerId: played.targetPlayerId, claimedAt: played.submittedAt } : null,
        challenge: played ? {
          challengerPlayerId: played.challengerPlayerId,
          outcome: played.challengeOutcome,
          revealedCard: played.challengeOutcome ? played.card.kind : null,
          resolvedAt: played.challengeResolvedAt,
        } : null,
        lastEffect: round.lastEffect,
        targetVote: round.targetSecured && (round.phase === "target_vote" || round.voteResult !== null)
          ? { submitted: round.votes.size, eligible: Math.max(1, eligible.length), result: round.voteResult, tieBroken: round.voteTieBroken }
          : null,
        lastChanceActive: round.lastChanceRemaining !== null,
        lastChanceTurnsRemaining: round.lastChanceRemaining?.size ?? 0,
        basicActionAvailable: round.phase === "turn_action" && basicButtonAvailable(currentHand),
      },
    };
  }
  private prepareButtonRound(room: RoomState) {
    const active = [...room.players.values()].filter((candidate) => candidate.role === "player");
    if (active.length < 4 || active.length > 10) throw new LobbyError("NOT_READY");
    const preparedAt = this.now();
    const seed = this.roundSeed(room.roomId, room.nextRoundNumber);
    const deckSize = effectiveDeckSize(room.settings.buttonDeckPreset, active.length, room.settings.buttonCustomDeckSize);
    if (deckSize < minimumCustomDeckSize(active.length)) throw new LobbyError("SETTINGS_CONFLICT");
    const target = room.settings.buttonTarget ?? recommendedButtonTarget(room.settings.buttonDeckPreset, active.length, deckSize);
    const fullDeck = buildButtonDeck(deckSize, seed);
    const generated = generateRuleSet({
      seed: `${seed}:rules`, roundNumber: room.nextRoundNumber, miniGameId: THE_BUTTON_MINI_GAME.id,
      players: active.map((candidate) => ({ playerId: candidate.playerId, displayName: candidate.displayName, isHost: candidate.playerId === room.hostPlayerId })),
      settings: room.settings, capabilities: THE_BUTTON_MINI_GAME.capabilities, history: room.ruleHistory, buttonMode: BUTTON_V2_MODE,
      buttonV2Balance: { deckSize, target, expectedTurnsPerPlayer: Math.max(3, Math.floor(deckSize / active.length)), cardCounts: buttonDeckKindCounts(fullDeck) },
    });
    const deck = [...fullDeck];
    const assignments = new Map(generated.assignments);
    for (const candidate of active) {
      const state = assignments.get(candidate.playerId)!;
      assignments.set(candidate.playerId, { ...state, revision: state.revision + 1, hand: deck.splice(0, 5) });
      if (!room.matchScores.has(candidate.playerId)) room.matchScores.set(candidate.playerId, 0);
    }
    appendRuleHistory(room.ruleHistory, generated.historyEntries);
    const roundId = assignments.values().next().value!.roundId;
    const random = seededRandom(`${seed}:round`);
    const startIndex = random.integer(0, active.length - 1);
    const participantOrder = active.map((candidate) => candidate.playerId);
    room.serverRound = {
      ...generated, assignments, phase: "rule_ack", seed, participantOrder, departedPlayerIds: new Set(),
      participantNames: new Map(active.map((candidate) => [candidate.playerId, candidate.displayName])), deck, discard: [],
      counter: 0, target, direction: "clockwise", currentIndex: startIndex, currentPlayerId: participantOrder[startIndex]!,
      countdownEndsAt: null, deadlineAt: null, played: null, shieldedPlayerIds: new Set(), skippedTurns: new Map(),
      targetSecured: false, securedByPlayerId: null, votes: new Map(), voteResult: null, voteTieBroken: false,
      lastChanceRemaining: null, lastChanceStartsAt: null, observableEvents: [{ type: "ROUND_EVENT", event: "ROUND_PREPARED", at: preparedAt }],
      ledgers: createRoundLedger(participantOrder), lastEffect: null, random,
    };
    room.publicRound = {
      roundId, roundNumber: room.nextRoundNumber, totalRounds: room.settings.roundCount,
      miniGameId: THE_BUTTON_MINI_GAME.id, buttonMode: BUTTON_V2_MODE, phase: "rule_ack", serverNow: preparedAt,
      publicObjective: `REACH EXACTLY ${target}.`, publicTimer: null, countdownEndsAt: null,
      publicGameState: {
        kind: "the-button-v2", counter: 0, target, targetSecured: false, securedByPlayerId: null,
        currentPlayerId: participantOrder[startIndex]!, direction: "clockwise", deckRemaining: deck.length, discardCount: 0,
        handCounts: participantOrder.map((playerId) => ({ playerId, count: 5 })), shieldedPlayerIds: [], skippedPlayerIds: [],
        currentClaim: null, challenge: null, lastEffect: null, targetVote: null, lastChanceActive: false,
        lastChanceTurnsRemaining: 0, basicActionAvailable: false,
      },
      publicPlayerStatuses: active.map((candidate) => ({ playerId: candidate.playerId, connected: candidate.connected, acknowledged: false })),
      publicEvents: [roundEvent("ROUND_PREPARED", preparedAt)], reveal: null,
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
      const round = room.serverRound;
      const privateState = round?.assignments.get(player.playerId);
      if (!round || !privateState || !room.publicRound) throw new LobbyError("ROUND_NOT_PREPARED");
      if (round.phase !== "rule_ack") throw new LobbyError("INVALID_GAME_PHASE");
      if (privateState.acknowledgedAt !== null) return false;
      const acknowledgedAt = this.now();
      this.bumpPrivate(round, player.playerId, (state) => ({ ...state, acknowledgedAt }));
      room.publicRound = {
        ...room.publicRound,
        publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === player.playerId ? { ...status, acknowledged: true } : status),
        publicEvents: [...room.publicRound.publicEvents, roundEvent("PLAYER_ACKNOWLEDGED", acknowledgedAt, { actorPlayerId: player.playerId })].slice(-100),
      };
      if (room.publicRound.publicPlayerStatuses.every((status) => status.acknowledged)) {
        round.phase = "countdown";
        round.countdownEndsAt = acknowledgedAt + this.buttonCountdownMs;
        room.publicRound = { ...room.publicRound, phase: "countdown", countdownEndsAt: round.countdownEndsAt, publicEvents: [...room.publicRound.publicEvents, roundEvent("COUNTDOWN_STARTED", acknowledgedAt)].slice(-100) };
      }
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    const state = this.privateState(socketId, input.roomId);
    if (state) this.publishPrivate(state, socketId);
    return result;
  }
  playCard(socketId: string, input: StateCommandPayload<typeof EVENTS.playCard>) {
    const result = this.command(socketId, EVENTS.playCard, input, (room, player) => {
      const round = room.serverRound;
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      if (!round || !room.publicRound || round.phase !== "turn_action") throw new LobbyError("INVALID_GAME_PHASE");
      if (round.currentPlayerId !== player.playerId) throw new LobbyError("NOT_YOUR_TURN");
      if (round.deadlineAt !== null && this.now() >= round.deadlineAt) throw new LobbyError("ACTION_REJECTED");
      const state = round.assignments.get(player.playerId)!;
      const card = state.hand.find((candidate) => candidate.cardId === input.cardId);
      if (!card) throw new LobbyError("CARD_NOT_FOUND");
      const targetId = input.targetPlayerId ?? null;
      if (isTargetedButtonCard(input.claim)) {
        if (!targetId || targetId === player.playerId || !round.participantOrder.includes(targetId) || round.departedPlayerIds.has(targetId)) throw new LobbyError("INVALID_TARGET");
      }
      this.bumpPrivate(round, player.playerId, (current) => ({ ...current, hand: current.hand.filter((candidate) => candidate.cardId !== card.cardId), pendingChoice: null }));
      const now = this.now();
      round.played = { card, actorPlayerId: player.playerId, claim: input.claim, targetPlayerId: targetId, submittedAt: now, challengerPlayerId: null, challengeOutcome: null, cancelled: false, penaltyPlayerId: null, challengeResolvedAt: null, revealEndsAt: null };
      round.phase = "challenge";
      round.deadlineAt = now + this.challengeDurationMs(room);
      this.appendPublicEvent(room, roundEvent("CARD_PLAYED", now, { actorPlayerId: player.playerId, targetPlayerId: targetId, claim: input.claim }));
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    this.deliverAllPrivate(this.member(socketId, input.roomId).room);
    return result;
  }
  private recordOutcome(round: ServerButtonRound, event: Extract<ObservableGameEvent, { type: "BUTTON_V2_OUTCOME" }>) {
    round.observableEvents.push(event);
  }
  private challengeScore(room: RoomState, winnerId: string, loserId: string) {
    const round = room.serverRound!;
    applyScoreDelta(room.matchScores, winnerId, SCORING_CONFIG.challengeWin);
    applyScoreDelta(room.matchScores, loserId, -SCORING_CONFIG.challengeLoss);
    const winner = round.ledgers.get(winnerId); if (winner) winner.challengePoints++;
    const loser = round.ledgers.get(loserId); if (loser) loser.challengePenalties++;
  }
  callBluff(socketId: string, input: StateCommandPayload<typeof EVENTS.callBluff>) {
    const result = this.command(socketId, EVENTS.callBluff, input, (room, player) => {
      const round = room.serverRound;
      const played = round?.played;
      if (player.role !== "player") throw new LobbyError("PLAYER_ONLY");
      if (!round || !played || round.phase !== "challenge") throw new LobbyError("CHALLENGE_CLOSED");
      if (round.deadlineAt !== null && this.now() >= round.deadlineAt) throw new LobbyError("CHALLENGE_CLOSED");
      if (player.playerId === played.actorPlayerId || round.departedPlayerIds.has(player.playerId) || !round.participantOrder.includes(player.playerId)) throw new LobbyError("ACTION_REJECTED");
      const now = this.now();
      const truthful = played.card.kind === played.claim;
      played.challengerPlayerId = player.playerId;
      played.challengeOutcome = truthful ? "false_accusation" : "bluff_caught";
      played.cancelled = !truthful;
      played.penaltyPlayerId = truthful ? player.playerId : played.actorPlayerId;
      played.challengeResolvedAt = now;
      played.revealEndsAt = now + this.challengeRevealMs;
      round.phase = "challenge_reveal";
      round.deadlineAt = null;
      if (truthful) {
        this.challengeScore(room, played.actorPlayerId, player.playerId);
        this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: played.actorPlayerId, opponentPlayerId: player.playerId, outcome: "FALSELY_ACCUSED", actualCard: played.card.kind, claimedCard: played.claim, targeted: isTargetedButtonCard(played.card.kind), at: now });
        this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: player.playerId, opponentPlayerId: played.actorPlayerId, outcome: "FALSE_CHALLENGE", actualCard: played.card.kind, claimedCard: played.claim, targeted: isTargetedButtonCard(played.card.kind), at: now });
        this.appendPublicEvent(room, roundEvent("FALSE_ACCUSATION", now, { actorPlayerId: played.actorPlayerId, targetPlayerId: player.playerId, claim: played.claim, revealedCard: played.card.kind }));
      } else {
        this.challengeScore(room, player.playerId, played.actorPlayerId);
        this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: played.actorPlayerId, opponentPlayerId: player.playerId, outcome: "BLUFF_CAUGHT", actualCard: played.card.kind, claimedCard: played.claim, targeted: isTargetedButtonCard(played.card.kind), at: now });
        this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: player.playerId, opponentPlayerId: played.actorPlayerId, outcome: "CORRECT_CHALLENGE", actualCard: played.card.kind, claimedCard: played.claim, targeted: isTargetedButtonCard(played.card.kind), at: now });
        this.appendPublicEvent(room, roundEvent("BLUFF_CAUGHT", now, { actorPlayerId: played.actorPlayerId, targetPlayerId: player.playerId, claim: played.claim, revealedCard: played.card.kind }));
      }
      this.appendPublicEvent(room, roundEvent("CHALLENGE_CALLED", now, { actorPlayerId: player.playerId, targetPlayerId: played.actorPlayerId, claim: played.claim, revealedCard: played.card.kind }));
      this.evaluateSecrets(room);
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    this.deliverAllPrivate(this.member(socketId, input.roomId).room);
    return result;
  }
  private afterChallengeReveal(room: RoomState) {
    const round = room.serverRound;
    const played = round?.played;
    if (!round || !played) return;
    const penaltyId = played.penaltyPlayerId;
    if (penaltyId && (round.assignments.get(penaltyId)?.hand.length ?? 0) > 0 && !round.departedPlayerIds.has(penaltyId)) {
      round.phase = "penalty_discard";
      played.revealEndsAt = null;
      this.bumpPrivate(round, penaltyId, (state) => ({ ...state, pendingChoice: { kind: "penalty_discard" } }));
      this.syncButtonPublic(room);
      this.deliverAllPrivate(room);
      return;
    }
    played.penaltyPlayerId = null;
    if (played.cancelled) this.finishTurn(room);
    else this.beginCardEffect(room);
  }
  penaltyDiscard(socketId: string, input: StateCommandPayload<typeof EVENTS.penaltyDiscard>) {
    const result = this.command(socketId, EVENTS.penaltyDiscard, input, (room, player) => {
      const round = room.serverRound;
      const played = round?.played;
      if (!round || !played || round.phase !== "penalty_discard" || played.penaltyPlayerId !== player.playerId) throw new LobbyError("CHOICE_REQUIRED");
      const state = round.assignments.get(player.playerId)!;
      const card = state.hand.find((candidate) => candidate.cardId === input.cardId);
      if (!card) throw new LobbyError("CARD_NOT_FOUND");
      this.bumpPrivate(round, player.playerId, (current) => ({ ...current, hand: current.hand.filter((candidate) => candidate.cardId !== card.cardId), pendingChoice: null }));
      round.discard.push(card);
      played.penaltyPlayerId = null;
      this.appendPublicEvent(room, roundEvent("PENALTY_DISCARDED", this.now(), { actorPlayerId: player.playerId }));
      if (played.cancelled) this.finishTurn(room); else this.beginCardEffect(room);
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    this.deliverAllPrivate(this.member(socketId, input.roomId).room);
    return result;
  }
  private beginCardEffect(room: RoomState) {
    const round = room.serverRound;
    const played = round?.played;
    if (!round || !played) return;
    if (played.card.kind === "WILD") {
      round.phase = "effect_choice";
      this.bumpPrivate(round, played.actorPlayerId, (state) => ({ ...state, pendingChoice: { kind: "wild_value" } }));
      this.syncButtonPublic(room);
      this.deliverAllPrivate(room);
      return;
    }
    this.resolveCardEffect(room, played.card.kind);
    this.finishTurn(room);
  }
  private resolveMovement(room: RoomState, actorId: string, movement: number, type: PublicButtonEffect["type"], targetId: string | null) {
    const round = room.serverRound!;
    const result = applyButtonMovement(round.counter, round.target, movement, round.targetSecured);
    round.counter = result.current;
    round.lastEffect = { effectId: randomUUID(), type, actorPlayerId: actorId, targetPlayerId: targetId, movement: result.applied, counterBefore: result.previous, counterAfter: result.current, at: this.now() };
    if (result.secured) this.secureTarget(room, actorId);
  }
  private resolveCardEffect(room: RoomState, kind: ButtonCardKind, wildMovement?: WildMovement) {
    const round = room.serverRound!;
    const played = round.played!;
    const actorId = played.actorPlayerId;
    const validTarget = isTargetedButtonCard(kind) && played.claim === kind ? played.targetPlayerId : null;
    let effectType: PublicButtonEffect["type"] = "movement";
    const movement = wildMovement ?? movementForCard(kind) ?? 0;
    let targetId = validTarget;
    if (validTarget && round.shieldedPlayerIds.has(validTarget)) {
      round.shieldedPlayerIds.delete(validTarget);
      effectType = "shield_blocked";
    } else if (kind === "SKIP" && validTarget) {
      round.skippedTurns.set(validTarget, (round.skippedTurns.get(validTarget) ?? 0) + 1);
      effectType = "skip";
    } else if (kind === "STEAL" && validTarget) {
      const targetState = round.assignments.get(validTarget);
      if (targetState?.hand.length) {
        const stolen = round.random.pick(targetState.hand);
        this.bumpPrivate(round, validTarget, (state) => ({ ...state, hand: state.hand.filter((card) => card.cardId !== stolen.cardId) }));
        this.bumpPrivate(round, actorId, (state) => ({ ...state, hand: [...state.hand, stolen] }));
      }
      effectType = "steal";
    } else if (kind === "INSPECT" && validTarget) {
      const targetState = round.assignments.get(validTarget);
      if (targetState?.hand.length) {
        const inspected = round.random.pick(targetState.hand);
        this.bumpPrivate(round, actorId, (state) => ({ ...state, inspections: [...state.inspections, { knowledgeId: randomUUID(), targetPlayerId: validTarget, card: inspected.kind, inspectedAt: this.now() }].slice(-8) }));
      }
      effectType = "inspect";
    } else if (kind === "REVERSE") {
      round.direction = round.direction === "clockwise" ? "counter_clockwise" : "clockwise";
      effectType = "reverse";
      targetId = null;
    } else if (kind === "SHIELD") {
      round.shieldedPlayerIds.add(actorId);
      effectType = "shield";
      targetId = actorId;
    }
    this.resolveMovement(room, actorId, movement, effectType, targetId);
    this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: actorId, opponentPlayerId: targetId, outcome: "CARD_RESOLVED", actualCard: kind, claimedCard: played.claim, targeted: validTarget !== null, at: this.now() });
    this.evaluateSecrets(room);
    this.appendPublicEvent(room, roundEvent("EFFECT_RESOLVED", this.now(), { actorPlayerId: actorId, targetPlayerId: targetId, claim: played.claim, movement: round.lastEffect?.movement ?? 0 }));
  }
  chooseWild(socketId: string, input: StateCommandPayload<typeof EVENTS.wildChoice>) {
    const result = this.command(socketId, EVENTS.wildChoice, input, (room, player) => {
      const round = room.serverRound;
      const played = round?.played;
      if (!round || !played || round.phase !== "effect_choice" || played.actorPlayerId !== player.playerId || played.card.kind !== "WILD") throw new LobbyError("CHOICE_REQUIRED");
      this.bumpPrivate(round, player.playerId, (state) => ({ ...state, pendingChoice: null }));
      this.resolveCardEffect(room, "WILD", input.movement);
      this.finishTurn(room);
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    this.deliverAllPrivate(this.member(socketId, input.roomId).room);
    return result;
  }
  private drawFor(round: ServerButtonRound, playerId: string) {
    const card = round.deck.shift();
    if (!card) return;
    this.bumpPrivate(round, playerId, (state) => ({ ...state, hand: [...state.hand, card] }));
  }
  private secureTarget(room: RoomState, actorId: string) {
    const round = room.serverRound!;
    if (round.targetSecured) return;
    round.targetSecured = true;
    round.securedByPlayerId = actorId;
    for (const playerId of this.eligibleRoundPlayerIds(room)) {
      const points = playerId === actorId ? SCORING_CONFIG.targetLanding : SCORING_CONFIG.targetOther;
      applyScoreDelta(room.matchScores, playerId, points);
      const ledger = round.ledgers.get(playerId); if (ledger) ledger.targetPoints += points;
    }
    this.appendPublicEvent(room, roundEvent("TARGET_SECURED", this.now(), { actorPlayerId: actorId }));
  }
  private finishTurn(room: RoomState) {
    const round = room.serverRound!;
    const played = round.played;
    if (!played) return;
    round.discard.push(played.card);
    this.drawFor(round, played.actorPlayerId);
    if (round.lastChanceRemaining) round.lastChanceRemaining.delete(played.actorPlayerId);
    round.played = null;
    round.deadlineAt = null;
    if (round.targetSecured && round.voteResult === null && round.lastChanceRemaining === null) this.startTargetVote(room);
    else if (round.lastChanceRemaining && round.lastChanceRemaining.size === 0) this.endButtonRound(room);
    else this.advanceTurn(room);
    this.syncButtonPublic(room);
  }
  private startTargetVote(room: RoomState) {
    const round = room.serverRound!;
    round.phase = "target_vote";
    round.deadlineAt = this.now() + this.turnDurationMs(room);
    round.votes.clear();
    round.voteResult = null;
    round.voteTieBroken = false;
    for (const playerId of this.eligibleRoundPlayerIds(room)) this.bumpPrivate(round, playerId, (state) => ({ ...state, pendingChoice: { kind: "target_vote", choice: null } }));
    this.appendPublicEvent(room, roundEvent("VOTE_STARTED", this.now()));
    this.syncButtonPublic(room);
    this.deliverAllPrivate(room);
  }
  targetVote(socketId: string, input: StateCommandPayload<typeof EVENTS.targetVote>) {
    const result = this.command(socketId, EVENTS.targetVote, input, (room, player) => {
      const round = room.serverRound;
      if (!round || round.phase !== "target_vote" || !this.eligibleRoundPlayerIds(room).includes(player.playerId)) throw new LobbyError("INVALID_GAME_PHASE");
      if (round.votes.has(player.playerId)) throw new LobbyError("VOTE_ALREADY_CAST");
      round.votes.set(player.playerId, input.choice);
      this.bumpPrivate(round, player.playerId, (state) => ({ ...state, pendingChoice: { kind: "target_vote", choice: input.choice } }));
      if (round.votes.size >= this.eligibleRoundPlayerIds(room).length) this.resolveTargetVote(room);
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    this.deliverAllPrivate(this.member(socketId, input.roomId).room);
    return result;
  }
  private resolveTargetVote(room: RoomState) {
    const round = room.serverRound!;
    const endVotes = [...round.votes.values()].filter((choice) => choice === "end").length;
    const continueVotes = [...round.votes.values()].filter((choice) => choice === "continue").length;
    round.voteTieBroken = endVotes === continueVotes;
    round.voteResult = endVotes === continueVotes ? (round.random.next() < .5 ? "end" : "continue") : endVotes > continueVotes ? "end" : "continue";
    round.deadlineAt = null;
    for (const playerId of this.eligibleRoundPlayerIds(room)) this.bumpPrivate(round, playerId, (state) => ({ ...state, pendingChoice: null }));
    this.appendPublicEvent(room, roundEvent("VOTE_RESOLVED", this.now()));
    if (round.voteResult === "end") this.endButtonRound(room); else this.startLastChance(room);
  }
  private startLastChance(room: RoomState) {
    const round = room.serverRound!;
    round.phase = "last_chance";
    round.lastChanceRemaining = new Set(this.eligibleRoundPlayerIds(room));
    round.lastChanceStartsAt = this.now() + 600;
    this.appendPublicEvent(room, roundEvent("LAST_CHANCE_STARTED", this.now()));
    this.syncButtonPublic(room);
  }
  basicButton(socketId: string, input: StateCommandPayload<typeof EVENTS.basicButton>) {
    const result = this.command(socketId, EVENTS.basicButton, input, (room, player) => {
      const round = room.serverRound;
      if (!round || round.phase !== "turn_action" || round.currentPlayerId !== player.playerId) throw new LobbyError("NOT_YOUR_TURN");
      if (!basicButtonAvailable(round.assignments.get(player.playerId)?.hand.length ?? 0)) throw new LobbyError("BASIC_ACTION_UNAVAILABLE");
      this.resolveMovement(room, player.playerId, 1, "basic", null);
      if (round.lastChanceRemaining) round.lastChanceRemaining.delete(player.playerId);
      if (round.targetSecured && round.voteResult === null && round.lastChanceRemaining === null) this.startTargetVote(room);
      else if (round.lastChanceRemaining && round.lastChanceRemaining.size === 0) this.endButtonRound(room);
      else this.advanceTurn(room);
      this.syncButtonPublic(room);
      return true;
    }, ["in_game"]);
    return result;
  }
  private startTurn(room: RoomState, index: number) {
    const round = room.serverRound!;
    round.currentIndex = index;
    round.currentPlayerId = round.participantOrder[index]!;
    round.phase = "turn_action";
    round.deadlineAt = this.now() + this.turnDurationMs(room);
    round.played = null;
    this.appendPublicEvent(room, roundEvent("TURN_STARTED", this.now(), { actorPlayerId: round.currentPlayerId }));
    this.syncButtonPublic(room);
  }
  private advanceTurn(room: RoomState) {
    const round = room.serverRound!;
    const step = round.direction === "clockwise" ? 1 : -1;
    for (let offset = 1; offset <= round.participantOrder.length * 2; offset++) {
      const index = (round.currentIndex + step * offset + round.participantOrder.length * 2) % round.participantOrder.length;
      const candidate = round.participantOrder[index]!;
      if (round.departedPlayerIds.has(candidate)) { round.lastChanceRemaining?.delete(candidate); continue; }
      if (round.lastChanceRemaining && !round.lastChanceRemaining.has(candidate)) continue;
      const skipped = round.skippedTurns.get(candidate) ?? 0;
      if (skipped > 0) {
        round.skippedTurns.set(candidate, skipped - 1);
        round.lastChanceRemaining?.delete(candidate);
        this.appendPublicEvent(room, roundEvent("TURN_SKIPPED", this.now(), { actorPlayerId: candidate }));
        if (round.lastChanceRemaining?.size === 0) { this.endButtonRound(room); return; }
        continue;
      }
      this.startTurn(room, index);
      return;
    }
    this.endButtonRound(room);
  }
  private noChallenge(room: RoomState) {
    const round = room.serverRound!;
    const played = round.played!;
    const now = this.now();
    this.recordOutcome(round, { type: "BUTTON_V2_OUTCOME", actorPlayerId: played.actorPlayerId, opponentPlayerId: played.targetPlayerId, outcome: played.card.kind === played.claim ? "TRUTHFUL" : "BLUFF_SUCCEEDED", actualCard: played.card.kind, claimedCard: played.claim, targeted: isTargetedButtonCard(played.card.kind), at: now });
    this.appendPublicEvent(room, roundEvent("NO_CHALLENGE", now, { actorPlayerId: played.actorPlayerId, targetPlayerId: played.targetPlayerId, claim: played.claim }));
    this.evaluateSecrets(room);
    this.beginCardEffect(room);
    this.deliverAllPrivate(room);
  }
  private endButtonRound(room: RoomState) {
    const round = room.serverRound;
    const publicRound = room.publicRound;
    if (!round || !publicRound || round.phase === "round_reveal" || round.phase === "match_complete") return;
    const now = this.now();
    round.observableEvents.push({ type: "ROUND_EVENT", event: "ROUND_RESOLVED", at: now });
    this.evaluateSecrets(room);
    const scored = scoreButtonV2Round({ roundNumber: publicRound.roundNumber, assignments: round.assignments, liveScores: room.matchScores, ledgers: round.ledgers, publicChallengeSucceeded: round.targetSecured });
    room.matchScores = scored.nextScores;
    const entries = [...round.assignments.values()].map((state) => ({
      playerId: state.playerId, displayName: round.participantNames.get(state.playerId) ?? "DEPARTED PLAYER",
      publicRuleDescription: state.secretRule.description, status: state.privateProgress.status === "completed" ? "completed" as const : "failed" as const,
      progressSummary: state.privateProgress.summary,
    }));
    const relationshipHighlights = round.relationshipGraph.edges.filter((edge) => edge.type !== "NEUTRAL").slice(0, 30).map(({ fromPlayerId, toPlayerId, type }) => ({ fromPlayerId, toPlayerId, type }));
    const finalRound = publicRound.roundNumber >= publicRound.totalRounds;
    round.phase = finalRound ? "match_complete" : "round_reveal";
    round.deadlineAt = null;
    round.played = null;
    for (const [playerId] of round.assignments) this.bumpPrivate(round, playerId, (state) => ({ ...state, pendingChoice: null }));
    const matchResult = finalRound ? { completedRounds: publicRound.roundNumber, totalRounds: publicRound.totalRounds, winnerPlayerIds: winners(scored.roundScore.standings), finalStandings: scored.roundScore.standings } : null;
    room.publicRound = {
      ...publicRound, phase: round.phase, publicTimer: null, countdownEndsAt: null,
      reveal: { roundId: publicRound.roundId, entries, relationshipHighlights }, scores: scored.roundScore.standings,
      roundScore: scored.roundScore, matchResult,
      publicEvents: [...publicRound.publicEvents, roundEvent("ROUND_RESOLVED", now), roundEvent("REVEAL_STARTED", now)].slice(-100),
    };
    this.syncButtonPublic(room);
    this.deliverAllPrivate(room);
  }
  continueRound(socketId: string, input: StateCommandPayload<typeof EVENTS.continueRound>) {
    const result = this.command(socketId, EVENTS.continueRound, input, (room, player) => {
      this.host(room, player);
      if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "round_reveal") throw new LobbyError("INVALID_GAME_PHASE");
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
      if (!room.serverRound || !room.publicRound || room.serverRound.phase !== "match_complete") throw new LobbyError("INVALID_GAME_PHASE");
      this.clearPrivateDeliveries(room);
      room.serverRound = null;
      room.publicRound = null;
      room.status = "lobby";
      room.nextRoundNumber = 1;
      room.matchScores.clear();
      room.ruleHistory.clear();
      for (const member of room.players.values()) { member.ready = false; member.afk = false; }
      return true;
    }, ["in_game"]);
  }
  private advanceRound(room: RoomState) {
    const round = room.serverRound;
    if (!round || !room.publicRound) return false;
    const now = this.now();
    if (round.phase === "countdown" && round.countdownEndsAt !== null && now >= round.countdownEndsAt) {
      round.countdownEndsAt = null;
      this.appendPublicEvent(room, roundEvent("ROUND_STARTED", now));
      this.startTurn(room, round.currentIndex);
      return true;
    }
    if (round.phase === "turn_action" && round.deadlineAt !== null && now >= round.deadlineAt) {
      this.appendPublicEvent(room, roundEvent("TURN_TIMED_OUT", now, { actorPlayerId: round.currentPlayerId }));
      if (round.currentPlayerId && round.lastChanceRemaining) round.lastChanceRemaining.delete(round.currentPlayerId);
      round.deadlineAt = null;
      if (round.lastChanceRemaining?.size === 0) this.endButtonRound(room); else this.advanceTurn(room);
      return true;
    }
    if (round.phase === "challenge" && round.deadlineAt !== null && now >= round.deadlineAt) {
      round.deadlineAt = null;
      this.noChallenge(room);
      return true;
    }
    if (round.phase === "challenge_reveal" && round.played?.revealEndsAt !== null && round.played?.revealEndsAt !== undefined && now >= round.played.revealEndsAt) {
      this.afterChallengeReveal(room);
      return true;
    }
    if (round.phase === "target_vote" && round.deadlineAt !== null && now >= round.deadlineAt) {
      this.resolveTargetVote(room);
      this.deliverAllPrivate(room);
      return true;
    }
    if (round.phase === "last_chance" && round.lastChanceStartsAt !== null && now >= round.lastChanceStartsAt) {
      round.lastChanceStartsAt = null;
      this.advanceTurn(room);
      return true;
    }
    return false;
  }

  private privateProjection(room: RoomState, state: PrivatePlayerRoundState) {
    const revealSafe = room.serverRound?.phase === "round_reveal" || room.serverRound?.phase === "match_complete";
    if (revealSafe) return state;
    return {
      ...state,
      privateProgress: {
        status: "in_progress" as const,
        current: null,
        target: null,
        summary: "PROGRESS TRACKED PRIVATELY · REVEALED AT ROUND END",
      },
    };
  }
  privateState(socketId: string, roomId: string) {
    const { room, player } = this.member(socketId, roomId);
    if (!mayReceivePrivatePlayerState({ ...player, isHost: player.playerId === room.hostPlayerId }, player.playerId)) return null;
    const state = room.serverRound?.assignments.get(player.playerId) ?? null;
    return state?.playerId === player.playerId ? this.privateProjection(room, state) : null;
  }
  deliverPrivate(socketId: string, roomId: string) {
    const state = this.privateState(socketId, roomId);
    if (state) this.publishPrivate(state, socketId);
  }
  private deliverAllPrivate(room: RoomState) {
    for (const player of room.players.values()) {
      if (!player.socketId || !player.connected || player.role !== "player") continue;
      const state = room.serverRound?.assignments.get(player.playerId);
      if (state?.playerId === player.playerId) this.publishPrivate(this.privateProjection(room, state), player.socketId);
    }
  }
  private clearPrivateDeliveries(room: RoomState) {
    for (const player of room.players.values()) if (player.socketId && player.connected && player.role === "player") this.publishPrivate(null, player.socketId);
  }
  private handleRoundDeparture(room: RoomState, playerId: string) {
    if (!room.serverRound || !room.publicRound) return;
    const round = room.serverRound;
    round.departedPlayerIds.add(playerId);
    room.publicRound = {
      ...room.publicRound,
      publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === playerId ? { ...status, connected: false, acknowledged: true } : status),
    };
    if (round.phase === "rule_ack" && room.publicRound.publicPlayerStatuses.every((status) => status.acknowledged)) {
      const countdownEndsAt = this.now() + this.buttonCountdownMs;
      round.phase = "countdown";
      round.countdownEndsAt = countdownEndsAt;
      room.publicRound = { ...room.publicRound, phase: "countdown", countdownEndsAt,
        publicEvents: [...room.publicRound.publicEvents, roundEvent("COUNTDOWN_STARTED", this.now())].slice(-100) };
    } else if (round.phase === "penalty_discard" && round.played?.penaltyPlayerId === playerId) {
      const state = round.assignments.get(playerId);
      const discarded = state?.hand[0];
      if (discarded) {
        this.bumpPrivate(round, playerId, (current) => ({ ...current, hand: current.hand.filter((card) => card.cardId !== discarded.cardId), pendingChoice: null }));
        round.discard.push(discarded);
      }
      round.played.penaltyPlayerId = null;
      if (round.played.cancelled) this.finishTurn(room); else this.beginCardEffect(room);
    } else if (round.phase === "effect_choice" && round.played?.actorPlayerId === playerId && round.played.card.kind === "WILD") {
      this.bumpPrivate(round, playerId, (state) => ({ ...state, pendingChoice: null }));
      this.resolveCardEffect(room, "WILD", 1);
      this.finishTurn(room);
    } else if (round.phase === "target_vote") {
      round.votes.delete(playerId);
      if (round.votes.size >= this.eligibleRoundPlayerIds(room).length) this.resolveTargetVote(room);
    } else if (round.phase === "turn_action" && round.currentPlayerId === playerId) {
      round.lastChanceRemaining?.delete(playerId);
      if (round.lastChanceRemaining?.size === 0) this.endButtonRound(room); else this.advanceTurn(room);
    } else if (round.phase === "last_chance") {
      round.lastChanceRemaining?.delete(playerId);
      if (round.lastChanceRemaining?.size === 0) this.endButtonRound(room);
    }
    this.syncButtonPublic(room);
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
    if (room.publicRound) room.publicRound = { ...room.publicRound, publicPlayerStatuses: room.publicRound.publicPlayerStatuses.map((status) => status.playerId === player.playerId ? { ...status, connected: false } : status) };
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
