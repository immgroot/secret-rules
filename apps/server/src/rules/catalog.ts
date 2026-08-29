import {
  RuleParametersSchema, RULE_CATEGORIES,
  type MiniGameCapability, type RelationshipType, type RuleCategory, type RuleDifficulty,
  type RuleParameters, type RuleProgressType, type RuleRarity, type TargetSelector,
} from "@secret-rules/shared";
import type { ParameterKey, RuleGenerationContext, RulePack, RuleTemplate } from "./types.ts";

type TemplateOptions = {
  selector?: TargetSelector;
  keys?: readonly ParameterKey[];
  capabilities?: readonly MiniGameCapability[];
  rarity?: RuleRarity;
  difficulty?: RuleDifficulty;
  progress?: RuleProgressType;
  relationships?: readonly RelationshipType[];
  conflictTags?: readonly string[];
  compatibilityTags?: readonly string[];
  incompatibilityTags?: readonly string[];
  weight?: number;
};
type Definition = TemplateOptions & { id: string; category: RuleCategory; text: string; short: string };
export type CatalogTemplate = RuleTemplate & { readonly definition: Definition };

const d = (id: string, category: RuleCategory, text: string, short: string, options: TemplateOptions = {}): Definition => ({ id, category, text, short, ...options });
const T = {
  target: { selector: "RANDOM_OTHER" as const, relationships: ["TARGETS"] as const },
  value: { keys: ["value"] as const, capabilities: ["HAS_PUBLIC_VALUE"] as const },
  count: { keys: ["count"] as const, capabilities: ["HAS_DISCRETE_ACTION"] as const, progress: "counter" as const },
  timer: { keys: ["seconds"] as const, capabilities: ["HAS_TIMER"] as const },
  sequence: { capabilities: ["HAS_SEQUENCE"] as const, progress: "sequence" as const },
  choice: { keys: ["option"] as const, capabilities: ["HAS_CHOICES"] as const },
};

// Each entry is a distinct objective family. Tokens create structured variants; they are not counted as extra families.
const DEFINITIONS: readonly Definition[] = [
  d("PERSONAL_EXACT_ACTIONS", "personal", "PERFORM EXACTLY {count} VALID ACTIONS.", "ACT EXACTLY {count} TIMES.", { ...T.count, incompatibilityTags: ["require:action-count:{count}"] }),
  d("PERSONAL_FIRST_ACTION", "personal", "PERFORM THE FIRST VALID ACTION OF THE ROUND.", "ACT FIRST.", { capabilities: ["HAS_DISCRETE_ACTION"], progress: "binary", incompatibilityTags: ["require:first-actor:self"] }),
  d("PERSONAL_FINAL_ACTION", "personal", "PERFORM THE FINAL VALID ACTION OF THE ROUND.", "ACT LAST.", { capabilities: ["HAS_FINAL_ACTOR"], progress: "binary", conflictTags: ["require:final-actor:self"], incompatibilityTags: ["require:final-actor:self"] }),
  d("PERSONAL_ODD_ACTION_TOTAL", "personal", "FINISH WITH AN ODD NUMBER OF VALID ACTIONS.", "END ON AN ODD COUNT.", { capabilities: ["HAS_DISCRETE_ACTION"], progress: "counter" }),
  d("PERSONAL_EVEN_ACTION_TOTAL", "personal", "FINISH WITH AN EVEN NUMBER OF VALID ACTIONS.", "END ON AN EVEN COUNT.", { capabilities: ["HAS_DISCRETE_ACTION"], progress: "counter" }),
  d("PERSONAL_ACTION_STREAK", "personal", "BUILD A STREAK OF {count} CONSECUTIVE VALID ACTIONS.", "BUILD A {count}-ACTION STREAK.", T.count),
  d("PERSONAL_UNIQUE_OPTION", "personal", "CHOOSE {option} WHEN YOU GET A CHOICE.", "CHOOSE {option}.", { ...T.choice, incompatibilityTags: ["require:option:{option}"] }),
  d("PERSONAL_CHANGE_DIRECTION", "personal", "CAUSE THE PUBLIC DIRECTION TO CHANGE {count} TIMES.", "CHANGE DIRECTION {count} TIMES.", { ...T.count, capabilities: ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_EVENTS"] }),
  d("PERSONAL_RECOVER_VALUE", "personal", "MAKE THE PUBLIC VALUE REACH {value}, MOVE AWAY, THEN BRING IT BACK.", "REACH {value}, LEAVE, THEN RETURN.", { ...T.value, progress: "sequence", conflictTags: ["require:value:{value}"] }),
  d("PERSONAL_PASS_EXACTLY", "personal", "VOLUNTARILY PASS EXACTLY {count} TIMES.", "PASS {count} TIMES.", T.count),

  d("TARGET_FINAL_ACTION", "target", "MAKE {target} PERFORM THE FINAL VALID ACTION.", "{target} MUST ACT LAST.", { ...T.target, capabilities: ["HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], conflictTags: ["require:final-actor:{target}"], difficulty: "medium" }),
  d("TARGET_FIRST_ACTION", "target", "MAKE {target} PERFORM THE FIRST VALID ACTION.", "{target} MUST ACT FIRST.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], conflictTags: ["require:first-actor:{target}"] }),
  d("TARGET_EXACT_ACTIONS", "target", "MAKE {target} PERFORM EXACTLY {count} VALID ACTIONS.", "{target}: EXACTLY {count} ACTIONS.", { ...T.target, ...T.count, keys: ["count"], capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], progress: "counter" }),
  d("TARGET_MORE_ACTIONS", "target", "FINISH WITH MORE VALID ACTIONS THAN {target}.", "OUT-ACT {target}.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], progress: "counter", relationships: ["TARGETS", "COMPETES_WITH"] }),
  d("TARGET_MATCH_ACTIONS", "target", "FINISH WITH THE SAME NUMBER OF VALID ACTIONS AS {target}.", "MATCH {target}’S ACTION COUNT.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], progress: "counter", relationships: ["TARGETS", "SUPPORTS"] }),
  d("TARGET_DIFFERENT_OPTION", "target", "CHOOSE A DIFFERENT OPTION FROM {target}.", "DISAGREE WITH {target}.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "COMPETES_WITH"] }),
  d("TARGET_SAME_OPTION", "target", "CHOOSE THE SAME OPTION AS {target}.", "MATCH {target}’S CHOICE.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "SUPPORTS"] }),
  d("TARGET_VALUE_TRIGGER", "target", "MAKE {target} CAUSE THE PUBLIC VALUE TO REACH {value}.", "{target} MUST HIT {value}.", { ...T.target, keys: ["value"], capabilities: ["HAS_PUBLIC_VALUE", "HAS_TARGETABLE_ACTIONS"], conflictTags: ["require:value:{value}"], difficulty: "medium" }),
  d("TARGET_FOLLOW_DIRECTION", "target", "MAKE {target} REVERSE THE CURRENT DIRECTION.", "{target} MUST REVERSE IT.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"] }),
  d("TARGET_OUTLAST", "target", "KEEP {target} ELIGIBLE UNTIL EVERY OTHER PLAYER HAS ACTED.", "KEEP {target} FOR LAST.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], difficulty: "hard" }),

  d("AVOID_PUBLIC_VALUE", "avoidance", "DON’T LET THE PUBLIC VALUE HIT {value}.", "KEEP IT AWAY FROM {value}.", { ...T.value, conflictTags: ["avoid:value:{value}"], progress: "survival" }),
  d("AVOID_FIRST_ACTION", "avoidance", "DO NOT PERFORM THE FIRST VALID ACTION.", "DON’T ACT FIRST.", { capabilities: ["HAS_DISCRETE_ACTION"], conflictTags: ["avoid:first-actor:self"], incompatibilityTags: ["avoid:first-actor:self"], progress: "survival" }),
  d("AVOID_FINAL_ACTION", "avoidance", "DO NOT PERFORM THE FINAL VALID ACTION.", "DON’T ACT LAST.", { capabilities: ["HAS_FINAL_ACTOR"], conflictTags: ["avoid:final-actor:self"], incompatibilityTags: ["avoid:final-actor:self"], progress: "survival" }),
  d("AVOID_TARGET_AFTER", "avoidance", "NEVER ACT IMMEDIATELY AFTER {target}.", "DON’T FOLLOW {target}.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], progress: "survival" }),
  d("AVOID_REPEAT_ACTION", "avoidance", "NEVER REPEAT THE SAME ACTION TWICE IN A ROW.", "DON’T REPEAT AN ACTION.", { capabilities: ["HAS_DISCRETE_ACTION"], progress: "survival" }),
  d("AVOID_OPTION", "avoidance", "DO NOT CHOOSE {option}.", "AVOID {option}.", { ...T.choice, progress: "survival", incompatibilityTags: ["avoid:option:{option}"] }),
  d("AVOID_ACTION_COUNT", "avoidance", "DO NOT FINISH ON EXACTLY {count} ACTIONS.", "AVOID {count} ACTIONS.", { ...T.count, progress: "survival", incompatibilityTags: ["avoid:action-count:{count}"] }),
  d("AVOID_VALUE_DIRECTION", "avoidance", "NEVER BE THE PLAYER WHO MOVES THE VALUE PAST {value}.", "DON’T CROSS {value}.", { ...T.value, progress: "survival" }),

  d("TIMING_ACT_BEFORE", "timing", "TAKE A VALID ACTION BEFORE {seconds} SECONDS HAVE PASSED.", "ACT BEFORE {seconds} SECONDS.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"] }),
  d("TIMING_WAIT_UNTIL", "timing", "WAIT AT LEAST {seconds} SECONDS BEFORE YOUR FIRST ACTION.", "WAIT {seconds} SECONDS.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"] }),
  d("TIMING_ACT_AFTER_TARGET", "timing", "ACT WITHIN {seconds} SECONDS AFTER {target}.", "FOLLOW {target} WITHIN {seconds}S.", { ...T.target, keys: ["seconds"], capabilities: ["HAS_TIMER", "HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("TIMING_PAUSE_AFTER_ACTION", "timing", "LEAVE AT LEAST {seconds} SECONDS BETWEEN YOUR ACTIONS.", "SPACE ACTIONS BY {seconds}S.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"], progress: "survival" }),
  d("TIMING_LAST_WINDOW", "timing", "PERFORM A VALID ACTION WITHIN THE FINAL {seconds} SECONDS.", "ACT IN THE LAST {seconds}S.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"] }),
  d("TIMING_TARGET_WINDOW", "timing", "MAKE {target} ACT BEFORE THE FINAL {seconds} SECONDS.", "GET {target} TO ACT EARLY.", { ...T.target, keys: ["seconds"], capabilities: ["HAS_TIMER", "HAS_TARGETABLE_ACTIONS"] }),
  d("TIMING_NO_RUSH", "timing", "DO NOT ACT DURING THE FIRST {seconds} SECONDS.", "STAY STILL FOR {seconds}S.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"], progress: "survival" }),
  d("TIMING_TWO_WINDOWS", "timing", "ACT ONCE EARLY AND ONCE IN THE FINAL {seconds} SECONDS.", "ACT EARLY AND LATE.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"], progress: "sequence", difficulty: "hard" }),

  d("SEQUENCE_ACT_AFTER_TARGET", "sequence", "PERFORM YOUR NEXT ACTION IMMEDIATELY AFTER {target}.", "ACT AFTER {target}.", { ...T.target, ...T.sequence, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("SEQUENCE_ACT_BEFORE_TARGET", "sequence", "PERFORM AN ACTION IMMEDIATELY BEFORE {target}.", "ACT BEFORE {target}.", { ...T.target, ...T.sequence, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("SEQUENCE_POSITION", "sequence", "BE THE {position}TH PLAYER TO TAKE A VALID ACTION.", "ACT IN POSITION {position}.", { keys: ["position"], capabilities: ["HAS_SEQUENCE"], progress: "sequence" }),
  d("SEQUENCE_TARGET_POSITION", "sequence", "MAKE {target} THE {position}TH PLAYER TO ACT.", "PUT {target} IN POSITION {position}.", { ...T.target, keys: ["position"], capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "DEPENDS_ON"] }),
  d("SEQUENCE_SANDWICH_TARGET", "sequence", "ACT ONCE BEFORE AND ONCE AFTER {target}.", "SURROUND {target}’S ACTION.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "DEPENDS_ON"], progress: "sequence", difficulty: "hard" }),
  d("SEQUENCE_ALTERNATE_TARGET", "sequence", "ALTERNATE VALID ACTIONS WITH {target} {count} TIMES.", "ALTERNATE WITH {target}.", { ...T.target, keys: ["count"], capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "SUPPORTS"], progress: "sequence" }),
  d("SEQUENCE_NO_NEIGHBOR_REPEAT", "sequence", "DO NOT LET THE SAME PLAYER ACT DIRECTLY BEFORE YOU TWICE.", "CHANGE WHO PRECEDES YOU.", { ...T.sequence, difficulty: "medium", progress: "survival" }),
  d("SEQUENCE_CLOSE_LOOP", "sequence", "MAKE THE FIRST ACTOR ALSO PERFORM THE FINAL ACTION.", "FIRST ACTOR MUST FINISH.", { capabilities: ["HAS_SEQUENCE", "HAS_FINAL_ACTOR"], progress: "sequence", difficulty: "hard" }),

  d("COOP_HELP_TARGET_COMPLETE", "cooperation", "HELP {target} COMPLETE AT LEAST {count} VALID ACTIONS.", "HELP {target} ACT {count} TIMES.", { ...T.target, keys: ["count"], capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"], compatibilityTags: ["support:target:{target}"] }),
  d("COOP_MATCH_TARGET", "cooperation", "MATCH {target}’S FINAL ACTION COUNT.", "MATCH {target}.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("COOP_SHARE_OPTION", "cooperation", "MAKE THE SAME FINAL CHOICE AS {target}.", "AGREE WITH {target}.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("COOP_CHAIN_THREE", "cooperation", "CREATE A THREE-PLAYER ACTION CHAIN WITH {target}.", "BUILD A CHAIN WITH {target}.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "DEPENDS_ON", "TARGETS"], difficulty: "hard" }),
  d("COOP_RESTORE_TARGET", "cooperation", "UNDO THE NEXT PUBLIC-VALUE CHANGE MADE BY {target}.", "RESTORE {target}’S CHANGE.", { ...T.target, capabilities: ["HAS_PUBLIC_VALUE", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("COOP_BOTH_ACT_LATE", "cooperation", "YOU AND {target} MUST BOTH ACT IN THE FINAL {seconds} SECONDS.", "FINISH LATE WITH {target}.", { ...T.target, keys: ["seconds"], capabilities: ["HAS_TIMER", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("COOP_HAND_OFF", "cooperation", "MAKE {target} ACT IMMEDIATELY AFTER YOUR FINAL ACTION.", "HAND OFF TO {target}.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "DEPENDS_ON", "TARGETS"] }),
  d("COOP_PAIR_SURVIVE", "cooperation", "KEEP BOTH YOU AND {target} ELIGIBLE UNTIL THE FINAL EVENT.", "SURVIVE WITH {target}.", { ...T.target, capabilities: ["HAS_PUBLIC_EVENTS", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"], progress: "survival" }),

  d("SABOTAGE_PREVENT_TARGET_FINAL", "sabotage", "PREVENT {target} FROM PERFORMING THE FINAL ACTION.", "STOP {target} ACTING LAST.", { ...T.target, capabilities: ["HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"], conflictTags: ["avoid:final-actor:{target}"], difficulty: "medium" }),
  d("SABOTAGE_BREAK_TARGET_STREAK", "sabotage", "INTERRUPT {target} BEFORE THEY COMPLETE {count} CONSECUTIVE ACTIONS.", "BREAK {target}’S STREAK.", { ...T.target, keys: ["count"], capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"] }),
  d("SABOTAGE_FORCE_OPTION", "sabotage", "MAKE {target} AVOID {option}.", "STEER {target} FROM {option}.", { ...T.target, keys: ["option"], capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"] }),
  d("SABOTAGE_OVERTAKE_TARGET", "sabotage", "FINISH WITH EXACTLY ONE MORE ACTION THAN {target}.", "BEAT {target} BY ONE.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["COMPETES_WITH", "TARGETS"], progress: "counter" }),
  d("SABOTAGE_REVERSE_TARGET", "sabotage", "REVERSE THE NEXT PUBLIC-VALUE CHANGE MADE BY {target}.", "REVERSE {target}’S CHANGE.", { ...T.target, capabilities: ["HAS_PUBLIC_VALUE", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"] }),
  d("SABOTAGE_DELAY_TARGET", "sabotage", "KEEP {target} FROM ACTING FOR THE FIRST {seconds} SECONDS.", "DELAY {target}.", { ...T.target, keys: ["seconds"], capabilities: ["HAS_TIMER", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"] }),
  d("SABOTAGE_DENY_VALUE", "sabotage", "STOP {target} FROM MOVING THE PUBLIC VALUE TO {value}.", "DENY {target} VALUE {value}.", { ...T.target, keys: ["value"], capabilities: ["HAS_PUBLIC_VALUE", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"], conflictTags: ["avoid:value:{value}"] }),
  d("SABOTAGE_SPLIT_PAIR", "sabotage", "MAKE {target} CHOOSE DIFFERENTLY FROM {target2}.", "SPLIT {target} AND {target2}.", { selector: "RANDOM_PAIR", capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["BLOCKS", "TARGETS"], difficulty: "hard" }),

  d("PROTECT_TARGET_TURN", "protection", "PROTECT {target}’S NEXT OPPORTUNITY TO ACT.", "PROTECT {target}’S TURN.", { ...T.target, capabilities: ["HAS_TARGETABLE_ACTIONS"], relationships: ["PROTECTS", "TARGETS"], compatibilityTags: ["protect:target:{target}"] }),
  d("PROTECT_TARGET_FINAL", "protection", "KEEP {target} ELIGIBLE TO PERFORM THE FINAL ACTION.", "PRESERVE {target}’S FINISH.", { ...T.target, capabilities: ["HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], relationships: ["PROTECTS", "TARGETS"] }),
  d("PROTECT_PUBLIC_VALUE", "protection", "RESTORE THE PUBLIC VALUE IF IT MOVES AWAY FROM {value}.", "DEFEND VALUE {value}.", { ...T.value, relationships: ["PROTECTS"], conflictTags: ["require:value:{value}"] }),
  d("PROTECT_TARGET_OPTION", "protection", "KEEP {option} AVAILABLE FOR {target}.", "SAVE {option} FOR {target}.", { ...T.target, keys: ["option"], capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["PROTECTS", "TARGETS"] }),
  d("PROTECT_PAIR_SEQUENCE", "protection", "KEEP {target} AND {target2} ADJACENT IN THE ACTION ORDER.", "KEEP THE PAIR TOGETHER.", { selector: "RANDOM_PAIR", capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["PROTECTS", "TARGETS"], difficulty: "hard" }),
  d("PROTECT_TARGET_SURVIVAL", "protection", "KEEP {target}’S OBJECTIVE STILL POSSIBLE UNTIL THE FINAL EVENT.", "KEEP {target} IN THE GAME.", { ...T.target, capabilities: ["HAS_PUBLIC_EVENTS", "HAS_TARGETABLE_ACTIONS"], relationships: ["PROTECTS", "TARGETS"], progress: "survival" }),

  d("SOCIAL_INDUCE_FIRST", "social", "CONVINCE {target} TO TAKE THE FIRST VALID ACTION.", "GET {target} TO ACT FIRST.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS"] }),
  d("SOCIAL_INDUCE_PASS", "social", "CONVINCE {target} TO PASS AT LEAST ONCE.", "GET {target} TO PASS.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS"] }),
  d("SOCIAL_HIDE_ALIGNMENT", "social", "CHOOSE THE SAME OPTION AS {target} WITHOUT ANNOUNCING YOUR PLAN.", "QUIETLY MATCH {target}.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("SOCIAL_FEINT_OPTION", "social", "PUBLICLY FAVOR ONE OPTION, THEN CHOOSE {option}.", "FEINT, THEN CHOOSE {option}.", { ...T.choice, difficulty: "medium" }),
  d("SOCIAL_BUILD_MAJORITY", "social", "MAKE {option} THE MOST POPULAR FINAL CHOICE.", "BUILD A MAJORITY FOR {option}.", { ...T.choice, progress: "threshold" }),
  d("SOCIAL_ISOLATE_TARGET", "social", "MAKE {target} THE ONLY PLAYER TO CHOOSE THEIR FINAL OPTION.", "ISOLATE {target}’S CHOICE.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["COMPETES_WITH", "TARGETS"], difficulty: "hard" }),
  d("SOCIAL_BROKER_PAIR", "social", "MAKE {target} AND {target2} CHOOSE THE SAME OPTION.", "UNITE {target} AND {target2}.", { selector: "RANDOM_PAIR", capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["SUPPORTS", "TARGETS"] }),
  d("SOCIAL_REDIRECT_FINAL", "social", "PERSUADE THE GROUP TO LET {target} TAKE THE FINAL ACTION.", "SET UP {target} TO FINISH.", { ...T.target, capabilities: ["HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], relationships: ["TARGETS", "DEPENDS_ON"] }),

  d("PREDICT_FINAL_ACTOR", "prediction", "PREDICT THAT {target} WILL PERFORM THE FINAL ACTION.", "PREDICT {target} ACTS LAST.", { ...T.target, capabilities: ["HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], progress: "prediction", relationships: ["TARGETS"] }),
  d("PREDICT_FINAL_VALUE", "prediction", "PREDICT THAT THE PUBLIC VALUE WILL FINISH AT {value}.", "PREDICT FINAL VALUE {value}.", { ...T.value, progress: "prediction" }),
  d("PREDICT_MAJORITY_OPTION", "prediction", "PREDICT THAT {option} WILL BE THE MAJORITY CHOICE.", "PREDICT {option} WINS.", { ...T.choice, progress: "prediction" }),
  d("PREDICT_TARGET_COUNT", "prediction", "PREDICT THAT {target} WILL ACT EXACTLY {count} TIMES.", "PREDICT {target}: {count} ACTIONS.", { ...T.target, keys: ["count"], capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], progress: "prediction", relationships: ["TARGETS"] }),
  d("PREDICT_FIRST_THRESHOLD", "prediction", "PREDICT THAT VALUE {value} WILL BE REACHED BEFORE THE FIRST {seconds} SECONDS END.", "PREDICT {value} ARRIVES EARLY.", { keys: ["value", "seconds"], capabilities: ["HAS_PUBLIC_VALUE", "HAS_TIMER"], progress: "prediction", difficulty: "hard" }),

  d("KNOWLEDGE_UNSAFE_VALUE", "private_knowledge", "YOU KNOW VALUE {value} IS UNSAFE. KEEP THAT INFORMATION PRIVATE.", "VALUE {value} IS UNSAFE.", { ...T.value, rarity: "uncommon", conflictTags: ["avoid:value:{value}"] }),
  d("KNOWLEDGE_BONUS_OPTION", "private_knowledge", "YOU KNOW {option} WILL MATTER AT REVEAL.", "{option} HAS HIDDEN IMPORTANCE.", { ...T.choice, rarity: "uncommon" }),
  d("KNOWLEDGE_TARGET_CLUE", "private_knowledge", "YOU KNOW {target}’S NEXT VALID ACTION CREATES A PUBLIC EVENT.", "WATCH {target}’S NEXT ACTION.", { ...T.target, capabilities: ["HAS_PUBLIC_EVENTS", "HAS_TARGETABLE_ACTIONS"], rarity: "rare", relationships: ["TARGETS"] }),
  d("KNOWLEDGE_TIMER_CLUE", "private_knowledge", "YOU KNOW SOMETHING CHANGES WHEN {seconds} SECONDS REMAIN.", "WATCH THE {seconds}-SECOND MARK.", { ...T.timer, rarity: "uncommon" }),
  d("KNOWLEDGE_SEQUENCE_CLUE", "private_knowledge", "YOU KNOW POSITION {position} IN THE ACTION ORDER IS IMPORTANT.", "POSITION {position} MATTERS.", { keys: ["position"], capabilities: ["HAS_SEQUENCE"], rarity: "rare" }),

  d("ABILITY_DOUBLE", "hidden_ability", "USE DOUBLE SO YOUR NEXT VALID ACTION COUNTS TWICE.", "DOUBLE YOUR NEXT ACTION.", { keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY"], rarity: "rare", difficulty: "medium" }),
  d("ABILITY_SWAP", "hidden_ability", "USE SWAP TO EXCHANGE YOUR NEXT OPPORTUNITY WITH {target}.", "SWAP WITH {target}.", { ...T.target, keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY", "HAS_TARGETABLE_ACTIONS"], rarity: "rare", relationships: ["TARGETS"] }),
  d("ABILITY_SHIELD", "hidden_ability", "USE SHIELD TO PROTECT {target}’S NEXT VALID ACTION.", "SHIELD {target}.", { ...T.target, keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY", "HAS_TARGETABLE_ACTIONS"], rarity: "rare", relationships: ["PROTECTS", "TARGETS"] }),
  d("ABILITY_REVERSE", "hidden_ability", "USE REVERSE AFTER A PUBLIC-VALUE CHANGE.", "REVERSE A VALUE CHANGE.", { keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY", "HAS_PUBLIC_VALUE"], rarity: "rare" }),
  d("ABILITY_FREEZE", "hidden_ability", "USE FREEZE TO DELAY THE NEXT PUBLIC EVENT.", "FREEZE THE NEXT EVENT.", { keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY", "HAS_PUBLIC_EVENTS"], rarity: "rare" }),
  d("ABILITY_COPY", "hidden_ability", "USE COPY AFTER {target} TO REPEAT THEIR VALID ACTION.", "COPY {target}.", { ...T.target, keys: ["ability"], capabilities: ["SUPPORTS_HIDDEN_ABILITY", "HAS_TARGETABLE_ACTIONS"], rarity: "rare", relationships: ["DEPENDS_ON", "TARGETS"] }),

  d("CONDITIONAL_IF_TARGET_ACTS", "conditional", "IF {target} ACTS FIRST, YOU MUST PERFORM THE FINAL ACTION.", "IF {target} STARTS, YOU FINISH.", { ...T.target, capabilities: ["HAS_DISCRETE_ACTION", "HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"], difficulty: "hard" }),
  d("CONDITIONAL_IF_VALUE", "conditional", "IF THE VALUE REACHES {value}, ACT WITHIN {seconds} SECONDS.", "IF {value}, ACT WITHIN {seconds}S.", { keys: ["value", "seconds"], capabilities: ["HAS_PUBLIC_VALUE", "HAS_TIMER", "HAS_DISCRETE_ACTION"], difficulty: "hard" }),
  d("CONDITIONAL_IF_OPTION", "conditional", "IF {target} CHOOSES {option}, CHOOSE A DIFFERENT OPTION.", "IF {target} PICKS {option}, DIFFER.", { ...T.target, keys: ["option"], capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"], difficulty: "hard" }),
  d("CONDITIONAL_IF_TIMER", "conditional", "IF NOBODY ACTS FOR {seconds} SECONDS, TAKE THE NEXT VALID ACTION.", "BREAK A {seconds}-SECOND SILENCE.", { ...T.timer, capabilities: ["HAS_TIMER", "HAS_DISCRETE_ACTION"], difficulty: "medium" }),
  d("CONDITIONAL_IF_REVERSED", "conditional", "IF THE DIRECTION REVERSES, MAKE {target} ACT NEXT.", "AFTER A REVERSAL, CUE {target}.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"], difficulty: "hard" }),
  d("CONDITIONAL_IF_TARGET_FAILS", "conditional", "IF {target} BECOMES UNABLE TO ACT, COMPLETE {count} ACTIONS YOURSELF.", "COVER FOR {target} WITH {count} ACTIONS.", { ...T.target, keys: ["count"], capabilities: ["HAS_DISCRETE_ACTION", "HAS_TARGETABLE_ACTIONS"], relationships: ["DEPENDS_ON", "TARGETS"], difficulty: "hard" }),

  d("WILD_EXACT_VALUE_DUEL", "wild", "MAKE THE VALUE HIT {value} IMMEDIATELY AFTER {target} TRIES TO MOVE IT AWAY.", "COUNTER {target} AT {value}.", { ...T.target, keys: ["value"], capabilities: ["HAS_PUBLIC_VALUE", "HAS_TARGETABLE_ACTIONS"], rarity: "wild", difficulty: "hard", relationships: ["CONFLICTS_WITH", "TARGETS"], conflictTags: ["require:value:{value}"] }),
  d("WILD_PAIR_FINALE", "wild", "MAKE {target} ACT SECOND-TO-LAST AND {target2} ACT LAST.", "SCRIPT A TWO-PLAYER FINALE.", { selector: "RANDOM_PAIR", capabilities: ["HAS_SEQUENCE", "HAS_FINAL_ACTOR", "HAS_TARGETABLE_ACTIONS"], rarity: "wild", difficulty: "hard", relationships: ["DEPENDS_ON", "TARGETS"] }),
  d("WILD_UNANIMOUS_EXCEPT_ONE", "wild", "MAKE EVERYONE EXCEPT {target} CHOOSE THE SAME OPTION.", "UNITE EVERYONE BUT {target}.", { ...T.target, capabilities: ["HAS_CHOICES", "HAS_TARGETABLE_ACTIONS"], rarity: "wild", difficulty: "hard", relationships: ["COMPETES_WITH", "TARGETS"] }),
  d("WILD_THREE_BEAT_COMBO", "wild", "ACT, THEN MAKE {target} ACT, THEN ACT AGAIN WITHOUT ANYONE INTERRUPTING.", "COMPLETE A THREE-BEAT COMBO.", { ...T.target, capabilities: ["HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS"], rarity: "wild", difficulty: "hard", relationships: ["DEPENDS_ON", "TARGETS"], progress: "sequence" }),
];

const COUNTS = [2, 3, 4] as const;
const VALUES = [7, 9, 11, 13, 17] as const;
const SECONDS = [5, 10, 15, 20] as const;
const OPTIONS = ["OPTION A", "OPTION B", "LEFT", "RIGHT"] as const;
const ABILITY_BY_TEMPLATE: Readonly<Record<string, RuleParameters["ability"]>> = {
  ABILITY_DOUBLE: "DOUBLE", ABILITY_SWAP: "SWAP", ABILITY_SHIELD: "SHIELD",
  ABILITY_REVERSE: "REVERSE", ABILITY_FREEZE: "FREEZE", ABILITY_COPY: "COPY",
};

function capabilities(definition: Definition): readonly MiniGameCapability[] {
  const result = new Set<MiniGameCapability>(definition.capabilities ?? []);
  if ((definition.selector ?? "SELF") !== "SELF") result.add("HAS_TARGETABLE_ACTIONS");
  return [...result];
}
function parameterSchema(definition: Definition) {
  const keys = new Set(definition.keys ?? []);
  return RuleParametersSchema.superRefine((parameters, context) => {
    const required = { count: "actionCount", value: "publicValue", seconds: "timeThresholdMs", position: "sequencePosition", option: "optionId", ability: "ability" } as const;
    for (const key of keys) if (parameters[required[key]] === undefined) context.addIssue({ code: "custom", message: `Missing ${required[key]}.` });
  });
}
function generateParameters(definition: Definition, context: RuleGenerationContext): RuleParameters {
  const parameters: RuleParameters = {};
  for (const key of definition.keys ?? []) {
    if (key === "count") parameters.actionCount = context.random.pick(COUNTS);
    else if (key === "value") parameters.publicValue = context.plannedValue ?? context.random.pick(VALUES);
    else if (key === "seconds") parameters.timeThresholdMs = context.random.pick(SECONDS) * 1_000;
    else if (key === "position") parameters.sequencePosition = context.random.integer(1, context.players.length);
    else if (key === "option") parameters.optionId = context.random.pick(OPTIONS);
    else if (key === "ability") { parameters.ability = ABILITY_BY_TEMPLATE[definition.id] ?? context.random.pick(["DOUBLE", "SWAP", "SHIELD", "REVERSE", "FREEZE", "COPY"]); parameters.uses = 1; }
  }
  return parameters;
}
function render(template: string, parameters: RuleParameters, context: RuleGenerationContext) {
  const replacements: Record<string, string> = {
    target: context.target?.displayName.toUpperCase() ?? "ANOTHER PLAYER",
    target2: context.secondaryTarget?.displayName.toUpperCase() ?? "ANOTHER PLAYER",
    count: String(parameters.actionCount ?? "?"), value: String(parameters.publicValue ?? "?"),
    seconds: String((parameters.timeThresholdMs ?? 0) / 1_000), position: String(parameters.sequencePosition ?? "?"),
    option: parameters.optionId ?? "AN OPTION", ability: parameters.ability ?? "ABILITY",
  };
  return template.replace(/\{(target2|target|count|value|seconds|position|option|ability)\}/g, (_, token: string) => replacements[token]!);
}

function compile(definition: Definition): CatalogTemplate {
  const schema = parameterSchema(definition);
  return {
    id: definition.id, supportedMiniGames: ["*"], category: definition.category, parameterSchema: schema,
    baseWeight: definition.weight ?? 1, rarity: definition.rarity ?? (definition.category === "wild" ? "wild" : definition.category === "hidden_ability" || definition.category === "private_knowledge" ? "rare" : "common"),
    difficulty: definition.difficulty ?? (["conditional", "wild"].includes(definition.category) ? "hard" : ["target", "sabotage", "sequence"].includes(definition.category) ? "medium" : "easy"),
    selector: definition.selector ?? "SELF", requiredCapabilities: capabilities(definition),
    conflictTags: definition.conflictTags ?? [], compatibilityTags: definition.compatibilityTags ?? [], incompatibilityTags: definition.incompatibilityTags ?? [],
    relationshipCapabilities: definition.relationships ?? [], progressType: definition.progress ?? "binary", rewardWeight: definition.difficulty === "hard" ? 1.5 : definition.difficulty === "medium" ? 1.2 : 1,
    parameterKeys: definition.keys ?? [], definition,
    generateParameters: (context) => generateParameters(definition, context),
    validate: (context, parameters) => schema.safeParse(parameters).success && ((definition.selector ?? "SELF") === "SELF" || (context.target !== null && context.target.playerId !== context.owner.playerId)),
    buildDescription: (parameters, context) => render(definition.text, parameters, context),
    buildShortDescription: (parameters, context) => render(definition.short, parameters, context),
    evaluateProgress: () => ({ status: "not_started", current: null, target: null, summary: "NOT STARTED" }),
    evaluateSuccess: () => false,
  };
}

export const RULE_TEMPLATES: readonly CatalogTemplate[] = DEFINITIONS.map(compile);
export const RULE_TEMPLATE_BY_ID = new Map(RULE_TEMPLATES.map((template) => [template.id, template]));
export const CORE_RULE_PACK: RulePack = { id: "core", name: "CORE RULES", supportedMiniGames: ["*"], requiredCapabilities: [], templateIds: RULE_TEMPLATES.filter((template) => template.category !== "wild").map((template) => template.id) };
export const CHAOS_RULE_PACK: RulePack = { id: "chaos", name: "CHAOS PACK", supportedMiniGames: ["*"], requiredCapabilities: [], templateIds: RULE_TEMPLATES.filter((template) => template.category === "wild").map((template) => template.id) };
export const RULE_PACKS: readonly RulePack[] = [CORE_RULE_PACK, CHAOS_RULE_PACK];

export function categoryCounts() {
  return Object.fromEntries(RULE_CATEGORIES.map((category) => [category, RULE_TEMPLATES.filter((template) => template.category === category).length])) as Record<RuleCategory, number>;
}

export function concreteVariantEstimate(playerCount: number) {
  return RULE_TEMPLATES.reduce((sum, template) => {
    const targetSpace = template.selector === "RANDOM_PAIR" ? (playerCount - 1) * (playerCount - 2) : template.selector === "RANDOM_OTHER" ? playerCount - 1 : 1;
    const parameterSpace = template.parameterKeys.reduce((total, key) => total * (key === "count" ? COUNTS.length : key === "value" ? VALUES.length : key === "seconds" ? SECONDS.length : key === "position" ? playerCount : key === "option" ? OPTIONS.length : 1), 1);
    return sum + targetSpace * parameterSpace;
  }, 0);
}
