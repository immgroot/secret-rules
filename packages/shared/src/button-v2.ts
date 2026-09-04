import { z } from "zod";

export const BUTTON_CARD_KINDS = [
  "PLUS_ONE", "PLUS_TWO", "PLUS_THREE", "MINUS_ONE", "MINUS_TWO",
  "SKIP", "STEAL", "INSPECT", "REVERSE", "SHIELD", "WILD",
] as const;
export const ButtonCardKindSchema = z.enum(BUTTON_CARD_KINDS);
export type ButtonCardKind = z.infer<typeof ButtonCardKindSchema>;

export const NUMBER_BUTTON_CARDS = ["PLUS_ONE", "PLUS_TWO", "PLUS_THREE", "MINUS_ONE", "MINUS_TWO"] as const;
export const NumberButtonCardKindSchema = z.enum(NUMBER_BUTTON_CARDS);
export type NumberButtonCardKind = z.infer<typeof NumberButtonCardKindSchema>;

export const EFFECT_BUTTON_CARDS = ["SKIP", "STEAL", "INSPECT", "REVERSE", "SHIELD", "WILD"] as const;
export const EffectButtonCardKindSchema = z.enum(EFFECT_BUTTON_CARDS);
export type EffectButtonCardKind = z.infer<typeof EffectButtonCardKindSchema>;

export const isNumberButtonCard = (kind: ButtonCardKind): kind is NumberButtonCardKind =>
  NumberButtonCardKindSchema.safeParse(kind).success;
export const isEffectButtonCard = (kind: ButtonCardKind): kind is EffectButtonCardKind =>
  EffectButtonCardKindSchema.safeParse(kind).success;

export const BUTTON_CARD_LABELS: Readonly<Record<ButtonCardKind, string>> = Object.freeze({
  PLUS_ONE: "+1", PLUS_TWO: "+2", PLUS_THREE: "+3", MINUS_ONE: "-1", MINUS_TWO: "-2",
  SKIP: "SKIP", STEAL: "STEAL", INSPECT: "INSPECT", REVERSE: "REVERSE", SHIELD: "SHIELD", WILD: "WILD",
});
export const BUTTON_CARD_MOVEMENT: Readonly<Partial<Record<ButtonCardKind, number>>> = Object.freeze({
  PLUS_ONE: 1, PLUS_TWO: 2, PLUS_THREE: 3, MINUS_ONE: -1, MINUS_TWO: -2,
});
export const TARGETED_BUTTON_CARDS = ["SKIP", "STEAL", "INSPECT"] as const;
export const TargetedButtonCardKindSchema = z.enum(TARGETED_BUTTON_CARDS);
export const isTargetedButtonCard = (kind: ButtonCardKind): kind is z.infer<typeof TargetedButtonCardKindSchema> =>
  TargetedButtonCardKindSchema.safeParse(kind).success;

export const ButtonCardSchema = z.strictObject({ cardId: z.uuid(), kind: ButtonCardKindSchema });
export type ButtonCard = z.infer<typeof ButtonCardSchema>;

export const BUTTON_DECK_PRESETS = ["quick", "standard", "long", "epic", "custom"] as const;
export const ButtonDeckPresetSchema = z.enum(BUTTON_DECK_PRESETS);
export type ButtonDeckPreset = z.infer<typeof ButtonDeckPresetSchema>;
export const BUTTON_DECK_PRESET_LABELS: Readonly<Record<ButtonDeckPreset, string>> = Object.freeze({
  quick: "QUICK", standard: "STANDARD", long: "LONG", epic: "EPIC", custom: "CUSTOM",
});
export const MIN_CUSTOM_DECK_SIZE = 30;
export const MAX_CUSTOM_DECK_SIZE = 200;
export const MIN_BUTTON_TARGET = 10;
export const MAX_BUTTON_TARGET = 200;
export const TURN_TIMER_PRESETS = [10, 15, 20, 30] as const;
export const CHALLENGE_TIMER_PRESETS = [5, 10, 15, 20] as const;
export const MIN_TURN_TIMER_SECONDS = 5;
export const MAX_TURN_TIMER_SECONDS = 60;
export const MIN_CHALLENGE_TIMER_SECONDS = 3;
export const MAX_CHALLENGE_TIMER_SECONDS = 30;
export const DEFAULT_TURN_TIMER_SECONDS = 15;
export const DEFAULT_CHALLENGE_TIMER_SECONDS = 10;

const DECK_ENDPOINTS: Readonly<Record<Exclude<ButtonDeckPreset, "custom">, readonly [number, number]>> = Object.freeze({
  quick: [40, 80], standard: [50, 100], long: [60, 130], epic: [80, 160],
});
const STANDARD_TARGETS = [30, 30, 35, 35, 40, 45, 50] as const;

/** Shared display helper. RoomOwner remains authoritative and revalidates the result. */
export function recommendedDeckSize(preset: Exclude<ButtonDeckPreset, "custom">, playerCount: number) {
  const count = Math.max(4, Math.min(10, Math.trunc(playerCount)));
  const [atFour, atTen] = DECK_ENDPOINTS[preset];
  const interpolated = atFour + (atTen - atFour) * ((count - 4) / 6);
  return Math.round(interpolated / 5) * 5;
}

export function minimumCustomDeckSize(playerCount: number) {
  return Math.max(MIN_CUSTOM_DECK_SIZE, Math.max(4, Math.min(10, Math.trunc(playerCount))) * 5 + 10);
}

export function effectiveDeckSize(preset: ButtonDeckPreset, playerCount: number, customSize: number) {
  return preset === "custom" ? Math.trunc(customSize) : recommendedDeckSize(preset, playerCount);
}

export function recommendedButtonTarget(preset: ButtonDeckPreset, playerCount: number, customSize: number) {
  const count = Math.max(4, Math.min(10, Math.trunc(playerCount)));
  const base = STANDARD_TARGETS[count - 4] ?? 30;
  let adjustment = preset === "quick" ? -5 : preset === "long" ? 5 : preset === "epic" ? 10 : 0;
  if (preset === "custom") {
    const difference = customSize - recommendedDeckSize("standard", count);
    adjustment = difference >= 30 ? 10 : difference >= 10 ? 5 : difference <= -10 ? -5 : 0;
  }
  return Math.max(MIN_BUTTON_TARGET, Math.min(MAX_BUTTON_TARGET, base + adjustment));
}

export const BUTTON_DIRECTIONS = ["clockwise", "counter_clockwise"] as const;
export const ButtonDirectionSchema = z.enum(BUTTON_DIRECTIONS);
export type ButtonDirection = z.infer<typeof ButtonDirectionSchema>;
export const BUTTON_VOTE_CHOICES = ["end", "continue"] as const;
export const ButtonVoteChoiceSchema = z.enum(BUTTON_VOTE_CHOICES);
export type ButtonVoteChoice = z.infer<typeof ButtonVoteChoiceSchema>;
export const WILD_MOVEMENTS = [1, 2, -1, -2] as const;
export const WildMovementSchema = z.union([z.literal(1), z.literal(2), z.literal(-1), z.literal(-2)]);
export type WildMovement = z.infer<typeof WildMovementSchema>;
