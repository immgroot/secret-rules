import { RULE_CATEGORIES, RuleParametersSchema, type MiniGameCapability, type RuleCategory, type RuleParameters } from "@secret-rules/shared";
import type { RuleGenerationContext, RulePack, RuleTemplate } from "../../rules/types.ts";
import { CLASSIC_BUTTON_MODE } from "./modes.ts";

type Key = "count" | "value" | "ability";
type Definition = {
  id: string; category: RuleCategory; text: string; short: string;
  selector?: "SELF" | "RANDOM_OTHER" | "RANDOM_PAIR" | "ALL_ACTIVE_PLAYERS";
  keys?: readonly Key[]; rarity?: "common" | "uncommon" | "rare" | "wild";
  difficulty?: "easy" | "medium" | "hard"; weight?: number;
  conflictTags?: readonly string[]; relationships?: RuleTemplate["relationshipCapabilities"];
  wildScoreBonusEligible?: boolean;
};

const d = (id: string, category: RuleCategory, text: string, short: string, options: Omit<Definition, "id" | "category" | "text" | "short"> = {}): Definition => ({ id, category, text, short, ...options });
const target = { selector: "RANDOM_OTHER" as const };
const pair = { selector: "RANDOM_PAIR" as const };

// Every entry below has distinct server evaluation semantics. Wording changes are not counted as families.
const DEFINITIONS: readonly Definition[] = [
  d("BUTTON_PRESS_EXACTLY", "personal", "PRESS EXACTLY {count} TIMES.", "PRESS EXACTLY {count} TIMES.", { keys: ["count"] }),
  d("BUTTON_PRESS_AT_LEAST", "personal", "PRESS AT LEAST {count} TIMES.", "PRESS {count}+ TIMES.", { keys: ["count"] }),
  d("BUTTON_PRESS_NO_MORE", "avoidance", "PRESS NO MORE THAN {count} TIMES.", "MAX {count} PRESSES.", { keys: ["count"] }),
  d("BUTTON_NEVER_PRESS", "avoidance", "NEVER PRESS THE BUTTON.", "NEVER PRESS.", { conflictTags: ["avoid:owner-press"] }),
  d("BUTTON_FIRST_PRESS", "timing", "PERFORM THE FIRST PRESS.", "PRESS FIRST.", { conflictTags: ["require:first-actor"] }),
  d("BUTTON_FINAL_PRESS", "timing", "PERFORM THE FINAL PRESS.", "PRESS LAST.", { conflictTags: ["require:final-actor"] }),
  d("BUTTON_PRESS_ONCE", "personal", "PRESS ONLY ONCE.", "ONE PRESS ONLY.", {}),
  d("BUTTON_FINISH_WITHOUT_PRESSING", "avoidance", "FINISH THE ROUND WITHOUT PRESSING.", "FINISH WITHOUT PRESSING.", { conflictTags: ["avoid:owner-press"] }),

  d("BUTTON_TARGET_FIRST", "target", "MAKE {target} PRESS FIRST.", "MAKE {target} PRESS FIRST.", { ...target, relationships: ["TARGETS"] }),
  d("BUTTON_TARGET_LAST", "target", "MAKE {target} PRESS LAST.", "MAKE {target} PRESS LAST.", { ...target, relationships: ["TARGETS"], conflictTags: ["require:target-final:{target}"] }),
  d("BUTTON_PREVENT_TARGET_LAST", "sabotage", "PREVENT {target} FROM PRESSING LAST.", "KEEP {target} FROM LAST.", { ...target, relationships: ["BLOCKS", "TARGETS"], conflictTags: ["avoid:target-final:{target}"] }),
  d("BUTTON_TARGET_EXACTLY", "target", "MAKE {target} PRESS EXACTLY {count} TIMES.", "{target}: EXACTLY {count}.", { ...target, keys: ["count"], relationships: ["TARGETS"] }),
  d("BUTTON_TARGET_AT_LEAST", "cooperation", "MAKE {target} PRESS AT LEAST {count} TIMES.", "{target}: {count}+ PRESSES.", { ...target, keys: ["count"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("BUTTON_TARGET_NO_SECOND_PRESS", "sabotage", "AFTER {target} PRESSES, PREVENT THEM FROM PRESSING AGAIN.", "STOP {target}'S SECOND PRESS.", { ...target, relationships: ["BLOCKS", "TARGETS"] }),
  d("BUTTON_TARGET_NEVER_PRESSES", "sabotage", "FINISH WITHOUT {target} PRESSING.", "KEEP {target} OFF THE BUTTON.", { ...target, relationships: ["BLOCKS", "TARGETS"] }),

  d("BUTTON_IMMEDIATELY_AFTER_TARGET", "sequence", "PRESS IMMEDIATELY AFTER {target}.", "FOLLOW {target} IMMEDIATELY.", { ...target, relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("BUTTON_NOT_AFTER_TARGET", "avoidance", "DO NOT PRESS IMMEDIATELY AFTER {target}.", "DON'T FOLLOW {target}.", { ...target, relationships: ["TARGETS"] }),
  d("BUTTON_TARGET_A_BEFORE_B", "sequence", "MAKE {target} PRESS BEFORE {target2}.", "{target} BEFORE {target2}.", { ...pair, relationships: ["TARGETS"] }),
  d("BUTTON_TARGET_A_AFTER_B", "sequence", "MAKE {target} PRESS AFTER {target2}.", "{target} AFTER {target2}.", { ...pair, relationships: ["TARGETS"] }),
  d("BUTTON_RETURN_AFTER_TARGET", "sequence", "PRESS, THEN MAKE {target} PRESS, THEN PRESS AGAIN.", "YOU → {target} → YOU.", { ...target, relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("BUTTON_TARGET_BETWEEN_DIFFERENT", "sequence", "PLACE {target}'S PRESS BETWEEN TWO DIFFERENT PLAYERS.", "TWO DIFFERENT PLAYERS AROUND {target}.", { ...target, relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("BUTTON_THREE_DISTINCT_IN_ROW", "cooperation", "CREATE THREE CONSECUTIVE PRESSES BY THREE DIFFERENT PLAYERS.", "THREE UNIQUE PRESSERS IN A ROW.", { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_EXACTLY_ONCE_AFTER_TARGET", "sequence", "PRESS EXACTLY ONCE IMMEDIATELY AFTER {target}.", "FOLLOW {target} ONCE.", { ...target, relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("BUTTON_ONLY_AFTER_TARGET", "conditional", "ONLY PRESS WHEN {target} PRESSED IMMEDIATELY BEFORE YOU.", "ONLY FOLLOW {target}.", { ...target, relationships: ["DEPENDS_ON", "TARGETS"] }),

  d("BUTTON_AVOID_VALUE", "avoidance", "DO NOT LET THE COUNTER HIT {value}.", "AVOID COUNTER {value}.", { keys: ["value"], conflictTags: ["avoid:value:{value}"] }),
  d("BUTTON_REACH_VALUE", "cooperation", "MAKE THE COUNTER HIT {value}.", "REACH COUNTER {value}.", { keys: ["value"], conflictTags: ["require:value:{value}"] }),
  d("BUTTON_OWNER_REACH_VALUE", "personal", "BE THE PLAYER WHO MAKES THE COUNTER HIT {value}.", "YOU MUST HIT {value}.", { keys: ["value"], conflictTags: ["require:value:{value}"] }),
  d("BUTTON_PRESS_WHILE_EVEN", "conditional", "PRESS AT LEAST ONCE WHILE THE COUNTER IS EVEN.", "PRESS FROM AN EVEN VALUE.", {}),
  d("BUTTON_PRESS_WHILE_ODD", "conditional", "PRESS AT LEAST ONCE WHILE THE COUNTER IS ODD.", "PRESS FROM AN ODD VALUE.", {}),
  d("BUTTON_LAND_EVEN", "personal", "MAKE ONE OF YOUR PRESSES END ON AN EVEN VALUE.", "LAND ON EVEN.", {}),
  d("BUTTON_LAND_ODD", "personal", "MAKE ONE OF YOUR PRESSES END ON AN ODD VALUE.", "LAND ON ODD.", {}),
  d("BUTTON_NO_PRESS_AFTER_VALUE", "avoidance", "DO NOT PRESS AFTER THE COUNTER REACHES {value}.", "STOP PRESSING AFTER {value}.", { keys: ["value"] }),
  d("BUTTON_PRESS_AFTER_VALUE", "timing", "PRESS AT LEAST ONCE AFTER THE COUNTER REACHES {value}.", "PRESS AFTER {value}.", { keys: ["value"] }),
  d("BUTTON_PRESS_BEFORE_VALUE", "timing", "PRESS BEFORE THE COUNTER REACHES {value}.", "PRESS BEFORE {value}.", { keys: ["value"] }),
  d("BUTTON_TARGET_BEFORE_VALUE", "target", "ENSURE {target} PRESSES BEFORE THE COUNTER REACHES {value}.", "{target} BEFORE {value}.", { ...target, keys: ["value"], relationships: ["TARGETS"] }),
  d("BUTTON_PASS_VALUE_WITHOUT_OWNER", "avoidance", "MAKE THE COUNTER PASS {value} WITHOUT YOU PRESSING.", "PASS {value} WITHOUT YOU.", { keys: ["value"] }),
  d("BUTTON_LAST_BEFORE_VALUE", "timing", "BE THE LAST PLAYER TO PRESS BEFORE THE COUNTER REACHES {value}.", "BE LAST BEFORE {value}.", { keys: ["value"] }),
  d("BUTTON_NOT_LAST_BEFORE_VALUE", "avoidance", "DO NOT BE THE LAST PLAYER TO PRESS BEFORE {value}.", "NOT LAST BEFORE {value}.", { keys: ["value"] }),
  d("BUTTON_PRESS_BEFORE_AND_AFTER", "conditional", "PRESS ONCE BEFORE AND ONCE AFTER THE COUNTER REACHES {value}.", "PRESS BEFORE + AFTER {value}.", { keys: ["value"], difficulty: "hard" }),
  d("BUTTON_HIT_TWO_VALUES", "sequence", "MAKE YOUR PRESSES LAND ON TWO DIFFERENT ODD VALUES.", "LAND ON TWO ODD VALUES.", { difficulty: "medium" }),

  d("BUTTON_DISTINCT_PLAYERS", "cooperation", "ENSURE AT LEAST {count} DIFFERENT PLAYERS PRESS.", "GET {count} PLAYERS PRESSING.", { keys: ["count"], selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_EVERYONE_PRESSES", "cooperation", "ENSURE EVERY ACTIVE PLAYER PRESSES.", "EVERYONE MUST PRESS.", { selector: "ALL_ACTIVE_PLAYERS" }),
  d("BUTTON_TARGET_REACHES_20", "target", "MAKE {target} BE RESPONSIBLE FOR REACHING 20.", "MAKE {target} HIT 20.", { ...target, relationships: ["TARGETS"], conflictTags: ["require:target-final:{target}"] }),
  d("BUTTON_PREVENT_TARGET_20", "sabotage", "PREVENT {target} FROM BEING RESPONSIBLE FOR REACHING 20.", "KEEP {target} FROM 20.", { ...target, relationships: ["BLOCKS", "TARGETS"], conflictTags: ["avoid:target-final:{target}"] }),
  d("BUTTON_FIRST_AND_FINAL", "wild", "PERFORM BOTH THE FIRST AND FINAL PRESS.", "PRESS FIRST AND LAST.", { rarity: "wild", difficulty: "hard", wildScoreBonusEligible: true }),
  d("BUTTON_TARGET_AND_OWNER_PRESS", "cooperation", "MAKE SURE BOTH YOU AND {target} PRESS.", "YOU + {target} MUST PRESS.", { ...target, relationships: ["SUPPORTS", "TARGETS"] }),

  d("BUTTON_DOUBLE", "hidden_ability", "YOUR NEXT VALID PRESS COUNTS TWICE.", "NEXT PRESS: +2.", { keys: ["ability"], rarity: "rare", weight: 0.65 }),
  d("BUTTON_BLOCK", "hidden_ability", "SECRETLY NEUTRALIZE {target}'S NEXT PRESS.", "BLOCK {target}'S NEXT PRESS.", { ...target, keys: ["ability"], rarity: "wild", difficulty: "hard", weight: 0.35, relationships: ["BLOCKS", "TARGETS"] }),
  d("BUTTON_PROTECT", "hidden_ability", "YOUR NEXT PRESS CANNOT BE NEUTRALIZED.", "PROTECT YOUR NEXT PRESS.", { keys: ["ability"], rarity: "rare", weight: 0.4 }),
];

const COUNTS = [2, 3, 4] as const;
const VALUES = [7, 9, 11, 13, 15, 17] as const;

function render(text: string, parameters: RuleParameters, context: RuleGenerationContext) {
  return text.replace(/\{(target2|target|count|value)\}/g, (_match, key: string) => ({
    target: context.target?.displayName.toUpperCase() ?? "ANOTHER PLAYER",
    target2: context.secondaryTarget?.displayName.toUpperCase() ?? "ANOTHER PLAYER",
    count: String(parameters.actionCount ?? "?"), value: String(parameters.publicValue ?? "?"),
  })[key]!);
}

function compile(definition: Definition): RuleTemplate {
  const keys = new Set(definition.keys ?? []);
  const parameterSchema = RuleParametersSchema.superRefine((parameters, context) => {
    if (keys.has("count") && parameters.actionCount === undefined) context.addIssue({ code: "custom", message: "Missing actionCount." });
    if (keys.has("value") && parameters.publicValue === undefined) context.addIssue({ code: "custom", message: "Missing publicValue." });
    if (keys.has("ability") && parameters.ability === undefined) context.addIssue({ code: "custom", message: "Missing ability." });
  });
  const ability = definition.id === "BUTTON_DOUBLE" ? "DOUBLE" : definition.id === "BUTTON_BLOCK" ? "BLOCK" : definition.id === "BUTTON_PROTECT" ? "PROTECT" : undefined;
  const capabilities: MiniGameCapability[] = ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_PUBLIC_EVENTS"];
  if ((definition.selector ?? "SELF") !== "SELF") capabilities.push("HAS_TARGETABLE_ACTIONS");
  return {
    id: definition.id, supportedMiniGames: ["the-button"], supportedButtonModes: [CLASSIC_BUTTON_MODE],
    wildScoreBonusEligible: definition.wildScoreBonusEligible ?? false, category: definition.category,
    parameterSchema, baseWeight: definition.weight ?? 1, rarity: definition.rarity ?? "common",
    difficulty: definition.difficulty ?? (["conditional", "sequence", "sabotage"].includes(definition.category) ? "medium" : "easy"),
    selector: definition.selector ?? "SELF", requiredCapabilities: capabilities,
    conflictTags: definition.conflictTags ?? [], compatibilityTags: [], incompatibilityTags: [],
    relationshipCapabilities: definition.relationships ?? [], progressType: keys.has("count") ? "counter" : "binary",
    rewardWeight: definition.difficulty === "hard" ? 1.5 : definition.difficulty === "medium" ? 1.2 : 1,
    parameterKeys: [...keys].map((key) => key === "ability" ? "ability" as const : key),
    generateParameters(context) {
      const parameters: RuleParameters = {};
      if (keys.has("count")) parameters.actionCount = context.random.pick(COUNTS);
      if (keys.has("value")) parameters.publicValue = context.plannedValue ?? context.random.pick(VALUES);
      if (ability) { parameters.ability = ability; parameters.uses = 1; }
      return parameters;
    },
    validate: (context, parameters) => parameterSchema.safeParse(parameters).success && ((definition.selector ?? "SELF") === "SELF" || definition.selector === "ALL_ACTIVE_PLAYERS" || context.target?.playerId !== context.owner.playerId),
    buildDescription: (parameters, context) => render(definition.text, parameters, context),
    buildShortDescription: (parameters, context) => render(definition.short, parameters, context),
    evaluateProgress: () => ({ status: "not_started", current: null, target: null, summary: "NOT STARTED" }),
    evaluateSuccess: () => false,
  };
}

export const BUTTON_RULE_TEMPLATES = DEFINITIONS.map(compile);
export const BUTTON_RULE_TEMPLATE_COUNT = BUTTON_RULE_TEMPLATES.length;
const BUTTON_RULE_TEMPLATE_BY_ID = new Map(BUTTON_RULE_TEMPLATES.map((template) => [template.id, template]));
export const buttonRuleHasWildScoreBonus = (templateId: string) => BUTTON_RULE_TEMPLATE_BY_ID.get(templateId)?.wildScoreBonusEligible === true;
export const BUTTON_RULE_PACK: RulePack = {
  id: "button", name: "THE BUTTON RULES", supportedMiniGames: ["the-button"],
  supportedButtonModes: [CLASSIC_BUTTON_MODE],
  requiredCapabilities: ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_PUBLIC_EVENTS"],
  templateIds: BUTTON_RULE_TEMPLATES.map((template) => template.id),
};

if (!BUTTON_RULE_TEMPLATES.every((template) => RULE_CATEGORIES.includes(template.category)) || BUTTON_RULE_TEMPLATES.length < 40) {
  throw new Error("The Button rule pack is incomplete.");
}
