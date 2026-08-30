import type { z } from "zod";
import type {
  ButtonCardKind, ButtonMode, MiniGameCapability, ObservableGameEvent, PrivateProgressSchema, RelationshipType,
  RuleCategory, RuleDifficulty, RuleParameters, RuleProgressType, RuleRarity,
  SecretRule, TargetSelector,
} from "@secret-rules/shared";

export type ActivePlayer = { playerId: string; displayName: string; isHost: boolean };
export type RuleHistoryEntry = { templateId: string; identity: string; category: RuleCategory; targetPlayerId?: string };
export type RuleHistory = ReadonlyMap<string, readonly RuleHistoryEntry[]>;

export type RuleGenerationContext = {
  readonly miniGameId: string;
  readonly capabilities: ReadonlySet<MiniGameCapability>;
  readonly players: readonly ActivePlayer[];
  readonly owner: ActivePlayer;
  readonly target: ActivePlayer | null;
  readonly secondaryTarget: ActivePlayer | null;
  readonly plannedValue: number | null;
  readonly buttonV2Balance?: ButtonV2BalanceContext;
  readonly random: RandomSource;
};

export type ButtonV2BalanceContext = {
  readonly deckSize: number;
  readonly target: number;
  readonly expectedTurnsPerPlayer: number;
  readonly cardCounts: Readonly<Record<ButtonCardKind, number>>;
};

export type RandomSource = {
  next(): number;
  integer(min: number, maxInclusive: number): number;
  pick<T>(values: readonly T[]): T;
  shuffle<T>(values: readonly T[]): T[];
};

export type RuleEvaluator = {
  readonly id: string;
  onGameEvent(event: ObservableGameEvent, context: RuleEvaluationContext): void;
  evaluateProgress(context: RuleEvaluationContext): z.infer<typeof PrivateProgressSchema>;
  evaluateSuccess(context: RuleEvaluationContext): boolean;
  evaluateFailure(context: RuleEvaluationContext): boolean;
};

export type RuleEvaluationContext = {
  readonly rule: SecretRule;
  readonly ownerPlayerId: string;
  readonly events: readonly ObservableGameEvent[];
};

export type RuleTemplate = {
  readonly id: string;
  readonly supportedMiniGames: readonly string[];
  readonly supportedButtonModes?: readonly ButtonMode[];
  readonly wildScoreBonusEligible?: boolean;
  readonly category: RuleCategory;
  readonly parameterSchema: z.ZodType<RuleParameters>;
  readonly baseWeight: number;
  readonly rarity: RuleRarity;
  readonly difficulty: RuleDifficulty;
  readonly selector: TargetSelector;
  readonly requiredCapabilities: readonly MiniGameCapability[];
  readonly conflictTags: readonly string[];
  readonly compatibilityTags: readonly string[];
  readonly incompatibilityTags: readonly string[];
  readonly relationshipCapabilities: readonly RelationshipType[];
  readonly progressType: RuleProgressType;
  readonly rewardWeight: number;
  readonly parameterKeys: readonly ParameterKey[];
  generateParameters(context: RuleGenerationContext): RuleParameters;
  validate(context: RuleGenerationContext, parameters: RuleParameters): boolean;
  buildDescription(parameters: RuleParameters, context: RuleGenerationContext): string;
  buildShortDescription(parameters: RuleParameters, context: RuleGenerationContext): string;
  evaluateProgress: RuleEvaluator["evaluateProgress"];
  evaluateSuccess: RuleEvaluator["evaluateSuccess"];
};

export type ParameterKey = "count" | "value" | "seconds" | "position" | "option" | "ability";

export type RelationshipEdge = {
  readonly fromPlayerId: string;
  readonly toPlayerId: string;
  readonly type: RelationshipType;
  readonly reasonTag: string;
};

export type RelationshipGraph = { readonly edges: readonly RelationshipEdge[] };

export type RulePack = {
  readonly id: string;
  readonly name: string;
  readonly supportedMiniGames: readonly string[];
  readonly supportedButtonModes?: readonly ButtonMode[];
  readonly requiredCapabilities: readonly MiniGameCapability[];
  readonly templateIds: readonly string[];
};

export type CandidateSet = {
  readonly assignments: ReadonlyMap<string, SecretRule>;
  readonly graph: RelationshipGraph;
  readonly qualityScore: number;
  readonly valid: boolean;
  readonly validationErrors: readonly string[];
};
