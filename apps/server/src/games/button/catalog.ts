import { RULE_CATEGORIES, RuleParametersSchema, type MiniGameCapability, type RuleCategory, type RuleParameters } from "@secret-rules/shared";
import type { RuleGenerationContext, RulePack, RuleTemplate } from "../../rules/types.ts";
import { BUTTON_V2_MODE } from "./modes.ts";

type Definition = {
  id: string;
  category: RuleCategory;
  text: string;
  short: string;
  difficulty: "medium" | "hard";
  count: (context: RuleGenerationContext) => number;
  selector?: "SELF" | "RANDOM_OTHER" | "RANDOM_PAIR" | "ALL_ACTIVE_PLAYERS";
  relationships?: RuleTemplate["relationshipCapabilities"];
  weight?: number;
};

const turns = (context: RuleGenerationContext) => Math.max(2, Math.floor(context.buttonV2Balance?.expectedTurnsPerPlayer ?? 4));
const standard = (preferred: number) => (context: RuleGenerationContext) => Math.max(1, Math.min(preferred, turns(context) - 1));
const hard = (preferred: number) => (context: RuleGenerationContext) => Math.max(2, Math.min(preferred, turns(context)));
const fixed = (count: number) => () => count;
const d = (id: string, category: RuleCategory, text: string, short: string, difficulty: Definition["difficulty"], count: Definition["count"], options: Omit<Definition, "id" | "category" | "text" | "short" | "difficulty" | "count"> = {}): Definition => ({ id, category, text, short, difficulty, count, ...options });

const DEFINITIONS: readonly Definition[] = [
  d("BUTTON_V2_BLUFF_SUCCESS", "personal", "SUCCESSFULLY BLUFF {count} TIMES.", "BLUFF {count} TIMES.", "medium", standard(3)),
  d("BUTTON_V2_CORRECT_CHALLENGE", "prediction", "CORRECTLY CATCH {count} BLUFFS.", "CATCH {count} BLUFFS.", "medium", standard(2)),
  d("BUTTON_V2_FALSELY_ACCUSED", "social", "GET FALSELY ACCUSED {count} TIMES.", "FALSELY ACCUSED {count} TIMES.", "medium", standard(2)),
  d("BUTTON_V2_NEGATIVE_RESOLVED", "personal", "SUCCESSFULLY RESOLVE {count} NEGATIVE NUMBER CARDS.", "RESOLVE {count} NEGATIVE CARDS.", "medium", standard(3)),
  d("BUTTON_V2_TARGETED_RESOLVED", "target", "SUCCESSFULLY RESOLVE {count} TARGETED EFFECTS.", "RESOLVE {count} TARGETED EFFECTS.", "medium", standard(2), { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_V2_DISTINCT_CLAIMS", "sequence", "MAKE SUCCESSFUL CLAIMS USING {count} DIFFERENT CARD TYPES.", "CLAIM {count} CARD TYPES.", "medium", fixed(3)),
  d("BUTTON_V2_CHALLENGE_DIFFERENT_PLAYERS", "social", "CORRECTLY CHALLENGE {count} DIFFERENT PLAYERS.", "CATCH {count} DIFFERENT PLAYERS.", "medium", (context) => Math.min(2, context.players.length - 1), { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_V2_TRUTHFUL_RESOLUTIONS", "personal", "RESOLVE {count} TRUTHFUL CLAIMS.", "RESOLVE {count} TRUTHS.", "medium", standard(3)),
  d("BUTTON_V2_POSITIVE_RESOLVED", "cooperation", "SUCCESSFULLY RESOLVE {count} POSITIVE NUMBER CARDS.", "RESOLVE {count} POSITIVE CARDS.", "medium", standard(3)),
  d("BUTTON_V2_WIN_CHALLENGES", "prediction", "WIN {count} CHALLENGES.", "WIN {count} CHALLENGES.", "medium", standard(2)),
  d("BUTTON_V2_BLUFF_TARGET", "target", "SUCCESSFULLY BLUFF AGAINST {target} AT LEAST {count} TIME.", "BLUFF AGAINST {target}.", "medium", fixed(1), { selector: "RANDOM_OTHER", relationships: ["TARGETS"] }),
  d("BUTTON_V2_FALSELY_ACCUSED_BY_TARGET", "target", "GET FALSELY ACCUSED BY {target}.", "LET {target} ACCUSE YOU FALSELY.", "medium", fixed(1), { selector: "RANDOM_OTHER", relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("BUTTON_V2_BLUFF_UNCAUGHT", "wild", "SUCCESSFULLY BLUFF {count} TIMES AND NEVER GET CAUGHT.", "BLUFF {count}; NEVER GET CAUGHT.", "hard", hard(4), { weight: .7 }),
  d("BUTTON_V2_CATCH_DISTINCT", "social", "CORRECTLY CATCH {count} DIFFERENT PLAYERS BLUFFING.", "CATCH {count} DIFFERENT PLAYERS.", "hard", (context) => Math.min(3, context.players.length - 1), { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_V2_FALSE_AND_CATCH", "conditional", "GET FALSELY ACCUSED AND CORRECTLY CATCH A BLUFF.", "FALSELY ACCUSED + CATCH ONE.", "hard", fixed(2)),
  d("BUTTON_V2_BLUFF_DISTINCT_CLAIMS", "sequence", "SUCCESSFULLY BLUFF USING {count} DIFFERENT CLAIMED CARD TYPES.", "BLUFF WITH {count} CLAIM TYPES.", "hard", fixed(3)),
  d("BUTTON_V2_WIN_THREE_CHALLENGES", "prediction", "WIN {count} CHALLENGES THIS ROUND.", "WIN {count} CHALLENGES.", "hard", hard(3)),
  d("BUTTON_V2_EFFECT_VARIETY", "sequence", "SUCCESSFULLY RESOLVE {count} DIFFERENT EFFECT CARD TYPES.", "RESOLVE {count} EFFECT TYPES.", "hard", fixed(2)),
  d("BUTTON_V2_SOCIAL_TWO_OPPONENTS", "social", "WIN CHALLENGES INVOLVING {count} DIFFERENT OPPONENTS.", "WIN AGAINST {count} OPPONENTS.", "hard", (context) => Math.min(2, context.players.length - 1), { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_V2_MIXED_MOVEMENT", "conditional", "RESOLVE BOTH A POSITIVE AND A NEGATIVE NUMBER CARD.", "RESOLVE POSITIVE + NEGATIVE.", "hard", fixed(2)),
  d("BUTTON_V2_TRUTH_STREAK", "sequence", "RESOLVE {count} TRUTHFUL CLAIMS WITHOUT A FALSE CLAIM.", "{count} TRUTHS WITHOUT A BLUFF.", "hard", hard(4)),
  d("BUTTON_V2_NEGATIVE_BLUFFS", "sabotage", "SUCCESSFULLY BLUFF WHILE PLAYING {count} NEGATIVE CARDS.", "BLUFF {count} NEGATIVE CARDS.", "hard", hard(2)),
];

function render(text: string, parameters: RuleParameters, context: RuleGenerationContext) {
  return text.replace(/\{(target|count)\}/g, (_match, key: string) => key === "target"
    ? context.target?.displayName.toUpperCase() ?? "ANOTHER PLAYER"
    : String(parameters.actionCount ?? "?"));
}

function compile(definition: Definition): RuleTemplate {
  const parameterSchema = RuleParametersSchema.superRefine((parameters, context) => {
    if (parameters.actionCount === undefined) context.addIssue({ code: "custom", message: "Missing actionCount." });
  });
  const capabilities: MiniGameCapability[] = ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_PUBLIC_EVENTS"];
  if ((definition.selector ?? "SELF") !== "SELF") capabilities.push("HAS_TARGETABLE_ACTIONS");
  return {
    id: definition.id, supportedMiniGames: ["the-button-v2"], supportedButtonModes: [BUTTON_V2_MODE],
    category: definition.category, parameterSchema, baseWeight: definition.weight ?? 1,
    rarity: definition.difficulty === "hard" ? "rare" : "common", difficulty: definition.difficulty,
    selector: definition.selector ?? "SELF", requiredCapabilities: capabilities,
    conflictTags: [], compatibilityTags: [], incompatibilityTags: [], relationshipCapabilities: definition.relationships ?? [],
    progressType: "counter", rewardWeight: definition.difficulty === "hard" ? 5 / 3 : 1, parameterKeys: ["count"],
    generateParameters: (context) => ({ actionCount: definition.count(context) }),
    validate: (context, parameters) => parameterSchema.safeParse(parameters).success &&
      (parameters.actionCount ?? 0) <= Math.max(1, Math.ceil((context.buttonV2Balance?.expectedTurnsPerPlayer ?? 4) + 1)) &&
      ((definition.selector ?? "SELF") === "SELF" || definition.selector === "ALL_ACTIVE_PLAYERS" || context.target?.playerId !== context.owner.playerId),
    buildDescription: (parameters, context) => render(definition.text, parameters, context),
    buildShortDescription: (parameters, context) => render(definition.short, parameters, context),
    evaluateProgress: () => ({ status: "not_started", current: 0, target: null, summary: "HIDDEN UNTIL REVEAL" }),
    evaluateSuccess: () => false,
  };
}

export const BUTTON_RULE_TEMPLATES = DEFINITIONS.map(compile);
export const BUTTON_RULE_TEMPLATE_COUNT = BUTTON_RULE_TEMPLATES.length;
export const BUTTON_RULE_PACK: RulePack = {
  id: "button-v2", name: "THE BUTTON V2 SECRETS", supportedMiniGames: ["the-button-v2"], supportedButtonModes: [BUTTON_V2_MODE],
  requiredCapabilities: ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_PUBLIC_EVENTS"], templateIds: BUTTON_RULE_TEMPLATES.map((template) => template.id),
};

if (!BUTTON_RULE_TEMPLATES.every((template) => RULE_CATEGORIES.includes(template.category)) || BUTTON_RULE_TEMPLATES.length < 20) throw new Error("The Button V2 rule pack is incomplete.");
