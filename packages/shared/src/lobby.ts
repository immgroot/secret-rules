import { z } from "zod";
import { PublicRoundStateSchema, type PrivateRoundDelivery } from "./rules.ts";
import {
  ButtonDeckPresetSchema, ButtonVoteChoiceSchema, NumberButtonCardKindSchema, WildMovementSchema,
  DEFAULT_CHALLENGE_TIMER_SECONDS, DEFAULT_TURN_TIMER_SECONDS,
  MAX_BUTTON_TARGET, MAX_CHALLENGE_TIMER_SECONDS, MAX_CUSTOM_DECK_SIZE, MAX_TURN_TIMER_SECONDS,
  MIN_BUTTON_TARGET, MIN_CHALLENGE_TIMER_SECONDS, MIN_CUSTOM_DECK_SIZE, MIN_TURN_TIMER_SECONDS,
} from "./button-v2.ts";

export const PROTOCOL_VERSION = 12;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const AVATAR_IDS = ["lime", "violet", "coral", "blue"] as const;
export const AVATAR_LABELS = { lime: "Bean", violet: "Round", coral: "Sleepy", blue: "Square" } as const;
export const PLAYER_COLORS = ["lime", "violet", "coral", "blue", "gold", "pink", "teal", "orange", "indigo", "silver"] as const;
export const COLOR_LABELS = { lime: "Green", violet: "Lavender", coral: "Coral", blue: "Blue", gold: "Gold", pink: "Pink", teal: "Teal", orange: "Orange", indigo: "Indigo", silver: "Silver" } as const;
export const ROUND_COUNTS = [3, 5, 7, 10] as const;
export const CHAOS_LEVELS = ["chill", "normal", "chaos"] as const;
export const CHAOS_DESCRIPTIONS = {
  chill: "Easier secrets. Good for learning.",
  normal: "Balanced secrets and player interaction.",
  chaos: "Harder, riskier and more conflicting secrets.",
} as const;
export const MAX_SPECTATORS = 8;
export const MAX_CHAT_MESSAGES = 50;
export const AFK_THRESHOLD_MS = 180_000;
export const AvatarIdSchema = z.enum(AVATAR_IDS);
export const PlayerColorSchema = z.enum(PLAYER_COLORS);
export const PlayerRoleSchema = z.enum(["player", "spectator"]);
export const VisibilitySchema = z.enum(["private", "public"]);
export type AvatarId = z.infer<typeof AvatarIdSchema>;
export type PlayerColor = z.infer<typeof PlayerColorSchema>;
export type PlayerRole = z.infer<typeof PlayerRoleSchema>;
export type RoomVisibility = z.infer<typeof VisibilitySchema>;
export const RoomCodeSchema = z.string().max(32).trim().toUpperCase().regex(/^[A-HJKMNP-Z2-9]{5}$/);
export const DisplayNameSchema = z.string().max(64).transform((value) => value.normalize("NFC").trim().replace(/ +/g, " "))
  .pipe(z.string().min(2).max(20).regex(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u));
export const RoomNameSchema = z.string().max(100).transform((value) => value.normalize("NFC").trim().replace(/ +/g, " "))
  .pipe(z.string().min(2).max(40).regex(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’!?-]*$/u));
const safeCharacters = (value: string, multiline = false) => [...value].every((character) => {
  const point = character.codePointAt(0)!;
  return (point >= 32 || (multiline && (point === 9 || point === 10))) && point !== 127 &&
    !(point >= 0x202a && point <= 0x202e) && !(point >= 0x2066 && point <= 0x2069);
});
export const RoomPasswordSchema = z.string().min(8).max(64).refine((value) => value.trim().length >= 8 && safeCharacters(value));
const safeText = (max: number, min = 0) => z.string().max(max * 2).trim().pipe(z.string().min(min).max(max).refine((value) => safeCharacters(value, true)));
export const ChatTextSchema = safeText(280, 1);
export const ReportDescriptionSchema = safeText(240);
export const REPORT_REASONS = ["spam", "harassment", "offensive_name", "cheating_exploit", "other"] as const;
export const REPORT_LABELS = { spam: "Spam", harassment: "Harassment", offensive_name: "Offensive name", cheating_exploit: "Cheating / exploit", other: "Other" } as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;
export const RoomSettingsSchema = z.strictObject({
  maxPlayers: z.number().int().min(4).max(10),
  roundCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  chaos: z.enum(CHAOS_LEVELS),
  buttonDeckPreset: ButtonDeckPresetSchema.default("standard"),
  buttonCustomDeckSize: z.number().int().min(MIN_CUSTOM_DECK_SIZE).max(MAX_CUSTOM_DECK_SIZE).default(50),
  buttonTarget: z.number().int().min(MIN_BUTTON_TARGET).max(MAX_BUTTON_TARGET).nullable().default(null),
  turnTimerSeconds: z.number().int().min(MIN_TURN_TIMER_SECONDS).max(MAX_TURN_TIMER_SECONDS).default(DEFAULT_TURN_TIMER_SECONDS),
  challengeTimerSeconds: z.number().int().min(MIN_CHALLENGE_TIMER_SECONDS).max(MAX_CHALLENGE_TIMER_SECONDS).default(DEFAULT_CHALLENGE_TIMER_SECONDS),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export const DEFAULT_ROOM_SETTINGS: Readonly<RoomSettings> = Object.freeze({
  maxPlayers: 10,
  roundCount: 5,
  chaos: "normal",
  buttonDeckPreset: "standard",
  buttonCustomDeckSize: 50,
  buttonTarget: null,
  turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
  challengeTimerSeconds: DEFAULT_CHALLENGE_TIMER_SECONDS,
});

export const PublicPlayerSchema = z.strictObject({
  playerId: z.uuid(), displayName: DisplayNameSchema, avatarId: AvatarIdSchema,
  playerColor: PlayerColorSchema.nullable(), role: PlayerRoleSchema, afk: z.boolean(),
  ready: z.boolean(), connected: z.boolean(), isHost: z.boolean(), joinedAt: z.number().int().nonnegative(),
}).refine((player) => (player.role === "player" ? player.playerColor !== null : player.playerColor === null && !player.ready && !player.isHost) && (player.connected || !player.afk));
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;
export const ChatMessageSchema = z.strictObject({
  messageId: z.uuid(), authorId: z.uuid(), displayName: DisplayNameSchema, avatarId: AvatarIdSchema,
  playerColor: PlayerColorSchema.nullable(), role: PlayerRoleSchema,
  text: ChatTextSchema, sentAt: z.number().int().nonnegative(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const RoomNoticeSchema = z.strictObject({
  kind: z.literal("match_abandoned"),
  message: z.literal("NOT ENOUGH PLAYERS REMAIN."),
  createdAt: z.number().int().nonnegative(),
});
export type RoomNotice = z.infer<typeof RoomNoticeSchema>;
export const PublicRoomSnapshotSchema = z.strictObject({
  roomId: z.uuid(), roomCode: RoomCodeSchema, hostPlayerId: z.uuid().nullable(),
  roomName: RoomNameSchema, visibility: VisibilitySchema, locked: z.boolean(), passwordRequired: z.boolean(),
  status: z.enum(["lobby", "in_game"]),
  players: z.array(PublicPlayerSchema).min(1).max(10 + MAX_SPECTATORS), settings: RoomSettingsSchema,
  chatMessages: z.array(ChatMessageSchema).max(MAX_CHAT_MESSAGES), publicRound: PublicRoundStateSchema.nullable(),
  roomNotice: RoomNoticeSchema.nullable().default(null),
  createdAt: z.number().int().nonnegative(), stateVersion: z.number().int().positive(),
}).superRefine((room, context) => {
  const active = room.players.filter((player) => player.role === "player");
  if (new Set(room.players.map((player) => player.playerId)).size !== room.players.length ||
      active.length > room.settings.maxPlayers || room.players.length - active.length > MAX_SPECTATORS ||
      new Set(active.map((player) => player.playerColor)).size !== active.length ||
      room.players.some((player) => player.isHost !== (player.playerId === room.hostPlayerId)) ||
      (room.hostPlayerId !== null && !room.players.some((player) => player.playerId === room.hostPlayerId)) ||
      new Set(room.chatMessages.map((message) => message.messageId)).size !== room.chatMessages.length) {
    context.addIssue({ code: "custom", message: "Inconsistent room snapshot." });
  }
});
export type PublicRoomSnapshot = z.infer<typeof PublicRoomSnapshotSchema>;

// Shapes only. Only the caller receives this grant; spectators get their OWN reconnect token.
export const SessionCredentialSchema = z.strictObject({
  roomId: z.uuid(), playerId: z.uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type SessionCredential = z.infer<typeof SessionCredentialSchema>;
export const SessionGrantSchema = SessionCredentialSchema.extend({ roomCode: RoomCodeSchema });
export type SessionGrant = z.infer<typeof SessionGrantSchema>;
export const ErrorCodeSchema = z.enum([
  "ROOM_NOT_FOUND", "ROOM_FULL", "INVALID_ROOM_CODE", "INVALID_DISPLAY_NAME", "NAME_TAKEN",
  "GAME_ALREADY_STARTED", "NOT_HOST", "PLAYER_NOT_FOUND", "INVALID_SESSION", "SESSION_ACTIVE",
  "SESSION_REPLACED", "SESSION_EXPIRED", "ROOM_EXPIRED", "RATE_LIMITED", "INVALID_PAYLOAD",
  "SETTINGS_CONFLICT", "REQUEST_CONFLICT", "SERVER_ERROR", "SERVER_BUSY", "CONNECTION_LOST",
  "ROOM_LOCKED", "PASSWORD_REQUIRED", "INCORRECT_PASSWORD", "INVALID_PASSWORD", "SECURITY_CHANGED",
  "INVALID_ROOM_NAME", "PLAYER_REMOVED", "INVALID_TARGET", "COLOR_UNAVAILABLE", "SPECTATORS_FULL",
  "PLAYER_ONLY", "HOST_MUST_TRANSFER", "INVALID_CHAT", "INVALID_REPORT", "REPORT_ALREADY_SENT",
  "NOT_READY", "ROUND_NOT_PREPARED", "INVALID_GAME_PHASE", "ACTION_REJECTED",
  "NOT_YOUR_TURN", "CARD_NOT_FOUND", "CHALLENGE_CLOSED", "CHOICE_REQUIRED",
  "VOTE_ALREADY_CAST", "BASIC_ACTION_UNAVAILABLE",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const ServerErrorSchema = z.strictObject({ code: ErrorCodeSchema, message: z.string().min(1).max(180), recoverable: z.boolean() });
export type ServerError = z.infer<typeof ServerErrorSchema>;
export const FailureSchema = z.strictObject({ ok: z.literal(false), error: ServerErrorSchema });
export const StateResultSchema = z.discriminatedUnion("ok", [z.strictObject({ ok: z.literal(true), state: PublicRoomSnapshotSchema }), FailureSchema]);
export const SessionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), state: PublicRoomSnapshotSchema, session: SessionGrantSchema }), FailureSchema,
]).superRefine((result, context) => {
  if (result.ok && (result.session.roomId !== result.state.roomId || result.session.roomCode !== result.state.roomCode ||
      !result.state.players.some((player) => player.playerId === result.session.playerId && player.connected))) {
    context.addIssue({ code: "custom", message: "Session does not match its room snapshot." });
  }
});
export const LeaveResultSchema = z.discriminatedUnion("ok", [z.strictObject({ ok: z.literal(true) }), FailureSchema]);
export type StateResult = z.infer<typeof StateResultSchema>;
export type SessionResult = z.infer<typeof SessionResultSchema>;
export type LeaveResult = z.infer<typeof LeaveResultSchema>;

export const EVENTS = {
  create: "room:create", join: "room:join", resume: "session:resume", leave: "room:leave",
  ready: "player:setReady", settings: "room:updateSettings", requestState: "room:requestState",
  visibility: "room:setVisibility", lock: "room:setLock", password: "room:setPassword", name: "room:setName",
  kick: "room:kickPlayer", transfer: "room:transferHost", avatar: "player:setAvatar", color: "player:setColor",
  randomize: "player:randomizeAvatar", role: "player:setRole", activity: "player:activity", chat: "chat:send", report: "player:report",
  startGame: "game:start", acknowledgeRule: "round:acknowledgeRule",
  playCard: "button:playCard", callBluff: "button:callBluff", passChallenge: "button:passChallenge", penaltyDiscard: "button:penaltyDiscard",
  targetVote: "button:targetVote", basicButton: "button:basicAction",
  continueRound: "round:continue", returnToLobby: "match:returnToLobby",
  update: "room:update", privateState: "round:privateState", ended: "session:ended", error: "server:error",
} as const;
export const RequestSchema = z.strictObject({ requestId: z.uuid() });
export const RoomCommandSchema = RequestSchema.extend({ roomId: z.uuid() });
export const CreateRoomSchema = RequestSchema.extend({ displayName: DisplayNameSchema, avatarId: AvatarIdSchema, roomName: RoomNameSchema.optional() });
export const JoinRoomSchema = RequestSchema.extend({ displayName: DisplayNameSchema, avatarId: AvatarIdSchema, roomCode: RoomCodeSchema, role: PlayerRoleSchema.optional(), password: z.string().max(64).optional() });
export const ResumeSessionSchema = RequestSchema.extend({ credential: SessionCredentialSchema });
export const SetReadySchema = RoomCommandSchema.extend({ ready: z.boolean() });
export const UpdateSettingsSchema = RoomCommandSchema.extend({ settings: RoomSettingsSchema });
export const SetVisibilitySchema = RoomCommandSchema.extend({ visibility: VisibilitySchema });
export const SetLockSchema = RoomCommandSchema.extend({ locked: z.boolean() });
export const SetPasswordSchema = z.discriminatedUnion("enabled", [
  RoomCommandSchema.extend({ enabled: z.literal(true), password: RoomPasswordSchema }),
  RoomCommandSchema.extend({ enabled: z.literal(false) }),
]);
export const SetRoomNameSchema = RoomCommandSchema.extend({ roomName: RoomNameSchema });
export const TargetPlayerSchema = RoomCommandSchema.extend({ targetPlayerId: z.uuid() });
export const SetAvatarSchema = RoomCommandSchema.extend({ avatarId: AvatarIdSchema });
export const SetColorSchema = RoomCommandSchema.extend({ playerColor: PlayerColorSchema });
export const SetRoleSchema = RoomCommandSchema.extend({ role: PlayerRoleSchema });
export const ChatSendSchema = RoomCommandSchema.extend({ text: ChatTextSchema });
export const ReportPlayerSchema = TargetPlayerSchema.extend({ reason: ReportReasonSchema, description: ReportDescriptionSchema });
export const PlayButtonCardSchema = z.discriminatedUnion("playType", [
  RoomCommandSchema.extend({
    playType: z.literal("number"), cardId: z.uuid(), claim: NumberButtonCardKindSchema,
  }),
  RoomCommandSchema.extend({
    playType: z.literal("effect"), cardId: z.uuid(), targetPlayerId: z.uuid().optional(), movement: WildMovementSchema.optional(),
  }),
]);
export const PenaltyDiscardSchema = RoomCommandSchema.extend({ cardId: z.uuid() });
export const TargetVoteSchema = RoomCommandSchema.extend({ choice: ButtonVoteChoiceSchema });
export const HandshakeSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  accountToken: z.string().min(20).max(4096).optional(),
});
export type CreateRoom = z.infer<typeof CreateRoomSchema>;
export type JoinRoom = z.infer<typeof JoinRoomSchema>;
export type ResumeSession = z.infer<typeof ResumeSessionSchema>;
export type SetReady = z.infer<typeof SetReadySchema>;
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;
export type RoomRequest = z.infer<typeof RoomCommandSchema>;

export const STATE_COMMAND_SCHEMAS = {
  [EVENTS.ready]: SetReadySchema, [EVENTS.settings]: UpdateSettingsSchema, [EVENTS.requestState]: RoomCommandSchema,
  [EVENTS.visibility]: SetVisibilitySchema, [EVENTS.lock]: SetLockSchema, [EVENTS.password]: SetPasswordSchema,
  [EVENTS.name]: SetRoomNameSchema, [EVENTS.kick]: TargetPlayerSchema, [EVENTS.transfer]: TargetPlayerSchema,
  [EVENTS.avatar]: SetAvatarSchema, [EVENTS.color]: SetColorSchema, [EVENTS.randomize]: RoomCommandSchema,
  [EVENTS.role]: SetRoleSchema, [EVENTS.activity]: RoomCommandSchema, [EVENTS.chat]: ChatSendSchema, [EVENTS.report]: ReportPlayerSchema,
  [EVENTS.startGame]: RoomCommandSchema, [EVENTS.acknowledgeRule]: RoomCommandSchema,
  [EVENTS.playCard]: PlayButtonCardSchema, [EVENTS.callBluff]: RoomCommandSchema, [EVENTS.passChallenge]: RoomCommandSchema,
  [EVENTS.penaltyDiscard]: PenaltyDiscardSchema,
  [EVENTS.targetVote]: TargetVoteSchema, [EVENTS.basicButton]: RoomCommandSchema,
  [EVENTS.continueRound]: RoomCommandSchema, [EVENTS.returnToLobby]: RoomCommandSchema,
} as const;
export type StateCommandName = keyof typeof STATE_COMMAND_SCHEMAS;
export type StateCommandPayload<K extends StateCommandName> = z.infer<(typeof STATE_COMMAND_SCHEMAS)[K]>;
export type StateCommandInput<K extends StateCommandName> = StateCommandPayload<K> extends infer T ? T extends unknown ? Omit<T, "roomId" | "requestId"> : never : never;
export const COMMAND_SCHEMAS = { ...STATE_COMMAND_SCHEMAS, [EVENTS.create]: CreateRoomSchema, [EVENTS.join]: JoinRoomSchema, [EVENTS.resume]: ResumeSessionSchema, [EVENTS.leave]: RoomCommandSchema } as const;
export type ClientToServerEvents = {
  [K in StateCommandName]: (payload: StateCommandPayload<K>, reply: (result: StateResult) => void) => void;
} & {
  [EVENTS.create]: (payload: CreateRoom, reply: (result: SessionResult) => void) => void;
  [EVENTS.join]: (payload: JoinRoom, reply: (result: SessionResult) => void) => void;
  [EVENTS.resume]: (payload: ResumeSession, reply: (result: SessionResult) => void) => void;
  [EVENTS.leave]: (payload: RoomRequest, reply: (result: LeaveResult) => void) => void;
};
export interface ServerToClientEvents {
  [EVENTS.update]: (state: PublicRoomSnapshot) => void;
  [EVENTS.privateState]: (payload: PrivateRoundDelivery) => void;
  [EVENTS.ended]: (reason: ServerError) => void;
  [EVENTS.error]: (error: ServerError) => void;
}
