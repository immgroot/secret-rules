import { z } from "zod";
import { ButtonModeSchema } from "./button-modes.ts";
import { ButtonCardKindSchema, ButtonCardSchema, ButtonDirectionSchema, ButtonVoteChoiceSchema } from "./button-v2.ts";

export const RULE_CATEGORIES = ["personal", "target", "avoidance", "timing", "sequence", "cooperation", "sabotage", "protection", "social", "prediction", "private_knowledge", "hidden_ability", "conditional", "wild"] as const;
export const RULE_RARITIES = ["common", "uncommon", "rare", "wild"] as const;
export const RULE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const RULE_PROGRESS_STATUSES = ["not_started", "in_progress", "currently_satisfied", "completed", "failed", "still_possible"] as const;
export const RULE_PROGRESS_TYPES = ["binary", "counter", "threshold", "sequence", "prediction", "survival"] as const;
export const RELATIONSHIP_TYPES = ["CONFLICTS_WITH", "SUPPORTS", "DEPENDS_ON", "BLOCKS", "PROTECTS", "TARGETS", "COMPETES_WITH", "NEUTRAL"] as const;
export const TARGET_SELECTORS = ["SELF", "RANDOM_OTHER", "HOST", "PLAYER_LEFT", "PLAYER_RIGHT", "RANDOM_PAIR", "ALL_ACTIVE_PLAYERS"] as const;
export const MINI_GAME_CAPABILITIES = ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_TIMER", "HAS_CHOICES", "HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS", "SUPPORTS_HIDDEN_ABILITY", "HAS_PUBLIC_EVENTS", "HAS_FINAL_ACTOR"] as const;

export const RuleCategorySchema = z.enum(RULE_CATEGORIES);
export const RuleRaritySchema = z.enum(RULE_RARITIES);
export const RuleDifficultySchema = z.enum(RULE_DIFFICULTIES);
export const RuleProgressStatusSchema = z.enum(RULE_PROGRESS_STATUSES);
export const RuleProgressTypeSchema = z.enum(RULE_PROGRESS_TYPES);
export const RelationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);
export const TargetSelectorSchema = z.enum(TARGET_SELECTORS);
export const MiniGameCapabilitySchema = z.enum(MINI_GAME_CAPABILITIES);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;
export type RuleRarity = z.infer<typeof RuleRaritySchema>;
export type RuleDifficulty = z.infer<typeof RuleDifficultySchema>;
export type RuleProgressStatus = z.infer<typeof RuleProgressStatusSchema>;
export type RuleProgressType = z.infer<typeof RuleProgressTypeSchema>;
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;
export type TargetSelector = z.infer<typeof TargetSelectorSchema>;
export type MiniGameCapability = z.infer<typeof MiniGameCapabilitySchema>;

export const RuleParametersSchema = z.strictObject({
  actionCount: z.number().int().min(1).max(20).optional(),
  publicValue: z.number().int().min(-99).max(999).optional(),
  threshold: z.number().int().min(1).max(100).optional(),
  timeThresholdMs: z.number().int().min(1_000).max(300_000).optional(),
  sequencePosition: z.number().int().min(1).max(10).optional(),
  direction: z.enum(["before", "after", "left", "right", "up", "down", "increase", "decrease"]).optional(),
  condition: z.enum(["first_action", "final_action", "value_reached", "timer_low", "target_acts", "option_selected", "round_event"]).optional(),
  action: z.enum(["act", "wait", "choose", "increase", "decrease", "protect", "block", "predict", "pass"]).optional(),
  optionId: z.string().min(1).max(32).optional(),
  eventType: z.enum(["PLAYER_ACTION", "PUBLIC_VALUE_CHANGED", "PLAYER_SELECTED_OPTION", "TIMER_THRESHOLD", "SEQUENCE_CHANGED", "ROUND_EVENT", "ABILITY_USED", "PUBLIC_STATE_CHANGED"]).optional(),
  requiredOutcome: z.enum(["success", "failure", "match", "different", "higher", "lower", "unchanged"]).optional(),
  ability: z.enum(["DOUBLE", "BLOCK", "PROTECT", "SWAP", "SHIELD", "REVERSE", "FREEZE", "COPY"]).optional(),
  uses: z.number().int().min(1).max(3).optional(),
});
export type RuleParameters = z.infer<typeof RuleParametersSchema>;

const RuleTagSchema = z.string().min(3).max(96).regex(/^[a-z0-9:_-]+$/);
export const SecretRuleSchema = z.strictObject({
  id: z.uuid(), templateId: z.string().min(3).max(64).regex(/^[A-Z0-9_]+$/), identity: z.string().min(3).max(256),
  miniGameId: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/), category: RuleCategorySchema,
  rarity: RuleRaritySchema, difficulty: RuleDifficultySchema, parameters: RuleParametersSchema,
  targetPlayerId: z.uuid().optional(), secondaryTargetPlayerId: z.uuid().optional(),
  conflictTags: z.array(RuleTagSchema).max(8), compatibilityTags: z.array(RuleTagSchema).max(8), incompatibilityTags: z.array(RuleTagSchema).max(8),
  relationshipType: RelationshipTypeSchema.optional(), description: z.string().min(3).max(240), shortDescription: z.string().min(3).max(100),
  helperText: z.string().min(3).max(160).optional(), progressType: RuleProgressTypeSchema,
  rewardWeight: z.number().min(0.1).max(5), visibility: z.literal("private"),
  evaluatorId: z.string().min(3).max(64).regex(/^[a-z0-9:_-]+$/),
});
export type SecretRule = z.infer<typeof SecretRuleSchema>;

export const PrivateProgressSchema = z.strictObject({ status: RuleProgressStatusSchema, current: z.number().int().nonnegative().nullable(), target: z.number().int().positive().nullable(), summary: z.string().min(1).max(120) });
export const PrivateInspectionSchema = z.strictObject({ knowledgeId: z.uuid(), targetPlayerId: z.uuid(), card: ButtonCardKindSchema, inspectedAt: z.number().int().nonnegative() });
export const PrivatePendingChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("penalty_discard") }),
  z.strictObject({ kind: z.literal("wild_value") }),
  z.strictObject({ kind: z.literal("target_vote"), choice: ButtonVoteChoiceSchema.nullable() }),
]);
export const PrivatePlayerRoundStateSchema = z.strictObject({
  roundId: z.uuid(), roundNumber: z.number().int().positive(), miniGameId: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/), playerId: z.uuid(), revision: z.number().int().positive(),
  hand: z.array(ButtonCardSchema).max(24), secretRule: SecretRuleSchema,
  privateProgress: PrivateProgressSchema, privateTargetPlayerId: z.uuid().nullable(), acknowledgedAt: z.number().int().nonnegative().nullable(),
  inspections: z.array(PrivateInspectionSchema).max(8), pendingChoice: PrivatePendingChoiceSchema.nullable(),
});
export type PrivatePlayerRoundState = z.infer<typeof PrivatePlayerRoundStateSchema>;

export const PublicRoundPlayerStatusSchema = z.strictObject({ playerId: z.uuid(), connected: z.boolean(), acknowledged: z.boolean() });
export const ROUND_PHASES = ["rule_ack", "countdown", "turn_action", "challenge", "challenge_reveal", "penalty_discard", "effect_choice", "turn_resolution", "target_vote", "last_chance", "round_reveal", "match_complete"] as const;
export const RoundPhaseSchema = z.enum(ROUND_PHASES);
export type RoundPhase = z.infer<typeof RoundPhaseSchema>;
export const PublicButtonTimerSchema = z.strictObject({ kind: z.enum(["turn", "challenge", "vote"]), deadlineAt: z.number().int().nonnegative(), durationMs: z.number().int().positive(), serverNow: z.number().int().nonnegative() });
export const PublicButtonClaimSchema = z.strictObject({ actorPlayerId: z.uuid(), claim: ButtonCardKindSchema, targetPlayerId: z.uuid().nullable(), claimedAt: z.number().int().nonnegative() });
export const PublicButtonChallengeSchema = z.strictObject({ challengerPlayerId: z.uuid().nullable(), outcome: z.enum(["bluff_caught", "false_accusation"]).nullable(), revealedCard: ButtonCardKindSchema.nullable(), resolvedAt: z.number().int().nonnegative().nullable() });
export const PublicTargetVoteSchema = z.strictObject({ submitted: z.number().int().nonnegative().max(10), eligible: z.number().int().min(1).max(10), result: ButtonVoteChoiceSchema.nullable(), tieBroken: z.boolean() });
export const PublicButtonEffectSchema = z.strictObject({
  effectId: z.uuid(), type: z.enum(["movement", "skip", "steal", "inspect", "reverse", "shield", "shield_blocked", "basic"]),
  actorPlayerId: z.uuid(), targetPlayerId: z.uuid().nullable(), movement: z.number().int().min(-3).max(3).nullable(),
  counterBefore: z.number().int().nonnegative(), counterAfter: z.number().int().nonnegative(), at: z.number().int().nonnegative(),
});
export type PublicButtonEffect = z.infer<typeof PublicButtonEffectSchema>;
export const ButtonV2PublicStateSchema = z.strictObject({
  kind: z.literal("the-button-v2"), counter: z.number().int().min(0).max(999), target: z.number().int().min(10).max(200),
  targetSecured: z.boolean(), securedByPlayerId: z.uuid().nullable(), currentPlayerId: z.uuid().nullable(), direction: ButtonDirectionSchema,
  deckRemaining: z.number().int().nonnegative().max(200), discardCount: z.number().int().nonnegative().max(200),
  handCounts: z.array(z.strictObject({ playerId: z.uuid(), count: z.number().int().nonnegative().max(24) })).min(4).max(10),
  shieldedPlayerIds: z.array(z.uuid()).max(10), skippedPlayerIds: z.array(z.uuid()).max(10),
  currentClaim: PublicButtonClaimSchema.nullable(), challenge: PublicButtonChallengeSchema.nullable(), lastEffect: PublicButtonEffectSchema.nullable(),
  targetVote: PublicTargetVoteSchema.nullable(), lastChanceActive: z.boolean(), lastChanceTurnsRemaining: z.number().int().nonnegative().max(10), basicActionAvailable: z.boolean(),
}).superRefine((state, context) => {
  if (state.targetSecured !== (state.securedByPlayerId !== null) || new Set(state.handCounts.map((entry) => entry.playerId)).size !== state.handCounts.length) context.addIssue({ code: "custom", message: "Inconsistent Button V2 public state." });
});
export type ButtonV2PublicState = z.infer<typeof ButtonV2PublicStateSchema>;
export const PublicRoundEventSchema = z.strictObject({
  eventId: z.uuid(), type: z.enum(["ROUND_PREPARED", "PLAYER_ACKNOWLEDGED", "COUNTDOWN_STARTED", "ROUND_STARTED", "TURN_STARTED", "TURN_TIMED_OUT", "CARD_PLAYED", "CHALLENGE_CALLED", "NO_CHALLENGE", "BLUFF_CAUGHT", "FALSE_ACCUSATION", "PENALTY_DISCARDED", "EFFECT_RESOLVED", "TARGET_SECURED", "VOTE_STARTED", "VOTE_RESOLVED", "LAST_CHANCE_STARTED", "TURN_SKIPPED", "ROUND_RESOLVED", "REVEAL_STARTED", "ROUND_CONTINUED"]),
  at: z.number().int().nonnegative(), actorPlayerId: z.uuid().nullable(), targetPlayerId: z.uuid().nullable(), claim: ButtonCardKindSchema.nullable(), revealedCard: ButtonCardKindSchema.nullable(), movement: z.number().int().min(-3).max(3).nullable(),
});
export type PublicRoundEvent = z.infer<typeof PublicRoundEventSchema>;
export const RoundRevealEntrySchema = z.strictObject({
  playerId: z.uuid(), displayName: z.string().min(1).max(20), publicRuleDescription: z.string().min(3).max(240),
  status: z.enum(["completed", "failed", "information_only", "ability_used", "ability_unused"]), progressSummary: z.string().min(1).max(120),
});
export const RoundRevealSchema = z.strictObject({
  roundId: z.uuid(), entries: z.array(RoundRevealEntrySchema).min(4).max(10),
  relationshipHighlights: z.array(z.strictObject({ fromPlayerId: z.uuid(), toPlayerId: z.uuid(), type: RelationshipTypeSchema })).max(30),
});
export type RoundReveal = z.infer<typeof RoundRevealSchema>;
export const SecretScoreResultSchema = z.enum(["success", "failed", "information_only"]);
export const RoundScoreEntrySchema = z.strictObject({
  playerId: z.uuid(), secretRuleResult: SecretScoreResultSchema,
  secretDifficulty: z.enum(["standard", "hard"]), challengePoints: z.number().int().nonnegative().max(50),
  challengePenalties: z.number().int().nonnegative().max(50), targetPoints: z.number().int().nonnegative().max(2),
  secretPoints: z.number().int().nonnegative().max(5), roundTotal: z.number().int().min(-50).max(100), matchTotal: z.number().int().nonnegative().max(10_000),
}).superRefine((entry, context) => {
  if (entry.roundTotal !== entry.challengePoints - entry.challengePenalties + entry.targetPoints + entry.secretPoints) context.addIssue({ code: "custom", message: "Inconsistent Button V2 score breakdown." });
});
export type RoundScoreEntry = z.infer<typeof RoundScoreEntrySchema>;
export const MatchStandingSchema = z.strictObject({
  rank: z.number().int().positive().max(10), playerId: z.uuid(), score: z.number().int().nonnegative().max(10_000),
});
export type MatchStanding = z.infer<typeof MatchStandingSchema>;
export const RoundScoreSchema = z.strictObject({
  roundNumber: z.number().int().positive(), publicChallengeSucceeded: z.boolean(),
  entries: z.array(RoundScoreEntrySchema).min(1).max(10), standings: z.array(MatchStandingSchema).min(1).max(10),
});
export type RoundScore = z.infer<typeof RoundScoreSchema>;
export const MatchResultSchema = z.strictObject({
  completedRounds: z.number().int().positive(), totalRounds: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  winnerPlayerIds: z.array(z.uuid()).min(1).max(10).refine((ids) => new Set(ids).size === ids.length),
  finalStandings: z.array(MatchStandingSchema).min(1).max(10),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
export const PublicRoundStateSchema = z.strictObject({
  roundId: z.uuid(), roundNumber: z.number().int().positive(), totalRounds: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  miniGameId: z.literal("the-button-v2"), buttonMode: ButtonModeSchema, phase: RoundPhaseSchema, serverNow: z.number().int().nonnegative(),
  publicObjective: z.string().min(10).max(80), publicTimer: PublicButtonTimerSchema.nullable(),
  countdownEndsAt: z.number().int().nonnegative().nullable(), publicGameState: ButtonV2PublicStateSchema,
  publicPlayerStatuses: z.array(PublicRoundPlayerStatusSchema).min(4).max(10),
  publicEvents: z.array(PublicRoundEventSchema).max(100), reveal: RoundRevealSchema.nullable(),
  scores: z.array(MatchStandingSchema).min(4).max(10), roundScore: RoundScoreSchema.nullable(), matchResult: MatchResultSchema.nullable(),
});
export type PublicRoundState = z.infer<typeof PublicRoundStateSchema>;

export const ObservableGameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PLAYER_ACTION"), actorPlayerId: z.uuid(), action: z.string().min(1).max(64), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("PUBLIC_VALUE_CHANGED"), previous: z.number(), current: z.number(), actorPlayerId: z.uuid().nullable(), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("PLAYER_SELECTED_OPTION"), actorPlayerId: z.uuid(), optionId: z.string().min(1).max(32), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("TIMER_THRESHOLD"), remainingMs: z.number().int().nonnegative(), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("SEQUENCE_CHANGED"), playerIds: z.array(z.uuid()).min(1).max(10), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("ROUND_EVENT"), event: z.string().min(1).max(64), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("ABILITY_USED"), actorPlayerId: z.uuid(), ability: z.string().min(1).max(32), at: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("PUBLIC_STATE_CHANGED"), stateId: z.string().min(1).max(64), at: z.number().int().nonnegative() }),
  z.strictObject({
    type: z.literal("BUTTON_V2_OUTCOME"), actorPlayerId: z.uuid(), opponentPlayerId: z.uuid().nullable(),
    outcome: z.enum(["BLUFF_SUCCEEDED", "BLUFF_CAUGHT", "TRUTHFUL", "FALSELY_ACCUSED", "CORRECT_CHALLENGE", "FALSE_CHALLENGE", "CARD_RESOLVED"]),
    actualCard: ButtonCardKindSchema, claimedCard: ButtonCardKindSchema, targeted: z.boolean(), at: z.number().int().nonnegative(),
  }),
]);
export type ObservableGameEvent = z.infer<typeof ObservableGameEventSchema>;
export const PrivateRoundDeliverySchema = z.strictObject({ state: PrivatePlayerRoundStateSchema.nullable() });
export type PrivateRoundDelivery = z.infer<typeof PrivateRoundDeliverySchema>;
