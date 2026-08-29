import { performance } from "node:perf_hooks";
import {
  PrivatePlayerRoundStateSchema, SecretRuleSchema,
  type ButtonMode, type MiniGameCapability, type PrivatePlayerRoundState, type RelationshipType,
  type RoomSettings, type RuleCategory, type RuleParameters, type SecretRule,
} from "@secret-rules/shared";
import { RULE_TEMPLATES } from "./catalog.ts";
import { BUTTON_RULE_TEMPLATES } from "../games/button/catalog.ts";
import { BUTTON_MODE_CONFIG, CLASSIC_BUTTON_MODE } from "../games/button/modes.ts";
import { deterministicUuid, seededRandom } from "./rng.ts";
import type { ActivePlayer, CandidateSet, RelationshipEdge, RelationshipGraph, RuleGenerationContext, RuleHistory, RuleHistoryEntry, RuleTemplate } from "./types.ts";

export const MAX_GENERATION_ATTEMPTS = 24;
export const RULE_HISTORY_LIMIT = 12;
export const CORE_PREVIEW_MINI_GAME = Object.freeze({
  id: "core-preview",
  name: "SECRET RULE ENGINE PREVIEW",
  publicObjective: "REVIEW YOUR PRIVATE RULE. KEEP IT TO YOURSELF.",
  capabilities: ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_TIMER", "HAS_CHOICES", "HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS", "SUPPORTS_HIDDEN_ABILITY", "HAS_PUBLIC_EVENTS", "HAS_FINAL_ACTOR"] as const satisfies readonly MiniGameCapability[],
});
export const THE_BUTTON_MINI_GAME = Object.freeze({
  id: "the-button", name: "THE BUTTON", publicObjective: "GET THE COUNTER TO EXACTLY 20.",
  defaultMode: CLASSIC_BUTTON_MODE,
  capabilities: ["HAS_DISCRETE_ACTION", "HAS_PUBLIC_VALUE", "HAS_TIMER", "HAS_SEQUENCE", "HAS_TARGETABLE_ACTIONS", "SUPPORTS_HIDDEN_ABILITY", "HAS_PUBLIC_EVENTS", "HAS_FINAL_ACTOR"] as const satisfies readonly MiniGameCapability[],
});
const ALL_RULE_TEMPLATES: readonly RuleTemplate[] = [...RULE_TEMPLATES, ...BUTTON_RULE_TEMPLATES];
const ALL_RULE_TEMPLATE_BY_ID = new Map(ALL_RULE_TEMPLATES.map((template) => [template.id, template]));

export type GenerateRuleSetInput = {
  readonly seed: string;
  readonly roundNumber: number;
  readonly miniGameId: string;
  readonly players: readonly ActivePlayer[];
  readonly settings: Pick<RoomSettings, "chaos">;
  readonly capabilities: readonly MiniGameCapability[];
  readonly buttonMode?: ButtonMode;
  readonly history?: RuleHistory;
};
export type GenerationMetadata = {
  readonly attempts: number;
  readonly usedFallback: boolean;
  readonly rejectedCandidates: number;
  readonly durationMs: number;
  readonly qualityScore: number;
  readonly validationErrors: readonly string[];
};
export type GeneratedRuleSet = {
  readonly assignments: ReadonlyMap<string, PrivatePlayerRoundState>;
  readonly allSecretRules: ReadonlyMap<string, SecretRule>;
  readonly relationshipGraph: RelationshipGraph;
  readonly generationSeed: string;
  readonly validationMetadata: GenerationMetadata;
  readonly historyEntries: ReadonlyMap<string, RuleHistoryEntry>;
};

const CATEGORY_WEIGHTS: Readonly<Record<RoomSettings["chaos"], Readonly<Partial<Record<RuleCategory, number>>>>> = {
  chill: { personal: 6, target: 3, avoidance: 2, timing: 3, sequence: 2, cooperation: 7, protection: 6, social: 3, prediction: 2, private_knowledge: 2, hidden_ability: 1, conditional: 1, sabotage: 0.35, wild: 0.05 },
  normal: { personal: 4, target: 4, avoidance: 3, timing: 3, sequence: 4, cooperation: 4, protection: 3, social: 3, prediction: 2, private_knowledge: 2, hidden_ability: 2, conditional: 2, sabotage: 3, wild: 0.7 },
  chaos: { personal: 2, target: 4, avoidance: 4, timing: 3, sequence: 5, cooperation: 2, protection: 3, social: 4, prediction: 2, private_knowledge: 2, hidden_ability: 4, conditional: 5, sabotage: 7, wild: 6 },
};

function eligibleTemplates(miniGameId: string, capabilities: ReadonlySet<MiniGameCapability>, buttonMode: ButtonMode) {
  const pool = miniGameId === THE_BUTTON_MINI_GAME.id ? BUTTON_RULE_TEMPLATES : RULE_TEMPLATES;
  return pool.filter((template) => template.supportedMiniGames.some((id) => id === "*" || id === miniGameId) &&
    (miniGameId !== THE_BUTTON_MINI_GAME.id || template.supportedButtonModes?.includes(buttonMode)) &&
    template.requiredCapabilities.every((capability) => capabilities.has(capability)));
}
function weightedPick<T>(values: readonly T[], weight: (value: T) => number, random: ReturnType<typeof seededRandom>) {
  const total = values.reduce((sum, value) => sum + Math.max(0, weight(value)), 0);
  if (total <= 0) return random.pick(values);
  let cursor = random.next() * total;
  for (const value of values) { cursor -= Math.max(0, weight(value)); if (cursor <= 0) return value; }
  return values.at(-1)!;
}
function resolveTarget(selector: RuleTemplate["selector"], owner: ActivePlayer, players: readonly ActivePlayer[], random: ReturnType<typeof seededRandom>, targetLoads: Map<string, number>, recent: readonly RuleHistoryEntry[]) {
  if (selector === "SELF" || selector === "ALL_ACTIVE_PLAYERS") return { target: null, secondary: null };
  const index = players.findIndex((player) => player.playerId === owner.playerId);
  if (selector === "HOST") return { target: players.find((player) => player.isHost && player.playerId !== owner.playerId) ?? players[(index + 1) % players.length]!, secondary: null };
  if (selector === "PLAYER_LEFT" || selector === "PLAYER_RIGHT") {
    const offset = selector === "PLAYER_LEFT" ? -1 : 1;
    return { target: players[(index + offset + players.length) % players.length]!, secondary: null };
  }
  const others = players.filter((player) => player.playerId !== owner.playerId);
  const choose = (pool: readonly ActivePlayer[]) => weightedPick(pool, (candidate) => {
    const load = targetLoads.get(candidate.playerId) ?? 0;
    const repeated = recent.filter((entry) => entry.targetPlayerId === candidate.playerId).length;
    return 12 / (1 + load * 2 + repeated * 3);
  }, random);
  const target = choose(others);
  targetLoads.set(target.playerId, (targetLoads.get(target.playerId) ?? 0) + 1);
  if (selector !== "RANDOM_PAIR") return { target, secondary: null };
  const secondary = choose(others.filter((player) => player.playerId !== target.playerId));
  targetLoads.set(secondary.playerId, (targetLoads.get(secondary.playerId) ?? 0) + 1);
  return { target, secondary };
}
function tag(template: string, rule: SecretRule) {
  return template.replace("{target}", rule.targetPlayerId ?? "none").replace("{value}", String(rule.parameters.publicValue ?? "none"))
    .replace("{count}", String(rule.parameters.actionCount ?? "none")).replace("{option}", rule.parameters.optionId?.toLowerCase().replaceAll(" ", "-") ?? "none");
}
function identity(template: RuleTemplate, parameters: RuleParameters, target: ActivePlayer | null, secondary: ActivePlayer | null) {
  const fields = Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right));
  return `${template.id}|${JSON.stringify(fields)}|${target?.playerId ?? "-"}|${secondary?.playerId ?? "-"}`;
}
function generatedRule(template: RuleTemplate, context: RuleGenerationContext, parameters: RuleParameters, namespace: string): SecretRule {
  const provisional = {
    id: deterministicUuid(`${namespace}:rule`), templateId: template.id,
    identity: identity(template, parameters, context.target, context.secondaryTarget), miniGameId: context.miniGameId,
    category: template.category, rarity: template.rarity, difficulty: template.difficulty, parameters,
    ...(context.target ? { targetPlayerId: context.target.playerId } : {}),
    ...(context.secondaryTarget ? { secondaryTargetPlayerId: context.secondaryTarget.playerId } : {}),
    conflictTags: [] as string[], compatibilityTags: [] as string[], incompatibilityTags: [] as string[],
    ...(template.relationshipCapabilities[0] ? { relationshipType: template.relationshipCapabilities[0] } : {}),
    description: template.buildDescription(parameters, context), shortDescription: template.buildShortDescription(parameters, context),
    helperText: "Evaluated from authoritative observable game events.", progressType: template.progressType,
    rewardWeight: template.rewardWeight, visibility: "private" as const, evaluatorId: `rule:${template.id.toLowerCase().replaceAll("_", "-")}`,
  };
  provisional.conflictTags = template.conflictTags.map((value) => tag(value, provisional));
  provisional.compatibilityTags = template.compatibilityTags.map((value) => tag(value, provisional));
  provisional.incompatibilityTags = template.incompatibilityTags.map((value) => tag(value, provisional));
  return SecretRuleSchema.parse(provisional);
}
function directRelationship(leftId: string, left: SecretRule, rightId: string, right: SecretRule): RelationshipEdge[] {
  const edges: RelationshipEdge[] = [];
  const add = (fromPlayerId: string, toPlayerId: string, type: RelationshipType, reasonTag: string) => {
    if (!edges.some((edge) => edge.fromPlayerId === fromPlayerId && edge.toPlayerId === toPlayerId && edge.type === type && edge.reasonTag === reasonTag)) edges.push({ fromPlayerId, toPlayerId, type, reasonTag });
  };
  for (const leftTag of left.conflictTags) for (const rightTag of right.conflictTags) {
    const [leftIntent, ...leftSubjectParts] = leftTag.split(":");
    const [rightIntent, ...rightSubjectParts] = rightTag.split(":");
    const leftSubject = leftSubjectParts.join(":");
    const rightSubject = rightSubjectParts.join(":");
    if (leftSubject === rightSubject && ((leftIntent === "require" && rightIntent === "avoid") || (leftIntent === "avoid" && rightIntent === "require"))) {
      add(leftId, rightId, "CONFLICTS_WITH", leftSubject); add(rightId, leftId, "CONFLICTS_WITH", leftSubject);
    }
  }
  const attach = (ownerId: string, rule: SecretRule) => {
    if (!rule.targetPlayerId) return;
    add(ownerId, rule.targetPlayerId, "TARGETS", `target:${rule.targetPlayerId}`);
    const template = ALL_RULE_TEMPLATE_BY_ID.get(rule.templateId);
    for (const type of template?.relationshipCapabilities ?? []) if (type !== "TARGETS" && type !== "NEUTRAL") add(ownerId, rule.targetPlayerId, type, `template:${rule.templateId.toLowerCase()}`);
  };
  attach(leftId, left); attach(rightId, right);
  if (left.targetPlayerId && left.targetPlayerId === right.targetPlayerId && leftId !== rightId) {
    add(leftId, rightId, "COMPETES_WITH", `shared-target:${left.targetPlayerId}`);
    add(rightId, leftId, "COMPETES_WITH", `shared-target:${left.targetPlayerId}`);
  }
  return edges;
}
export function buildRelationshipGraph(assignments: ReadonlyMap<string, SecretRule>): RelationshipGraph {
  const entries = [...assignments.entries()];
  const edges: RelationshipEdge[] = [];
  for (let left = 0; left < entries.length; left++) for (let right = left + 1; right < entries.length; right++) {
    const leftId = entries[left]![0]; const rightId = entries[right]![0];
    const pairEdges = directRelationship(leftId, entries[left]![1], rightId, entries[right]![1]);
    edges.push(...pairEdges);
    if (!pairEdges.some((edge) => (edge.fromPlayerId === leftId && edge.toPlayerId === rightId) || (edge.fromPlayerId === rightId && edge.toPlayerId === leftId))) {
      edges.push({ fromPlayerId: leftId, toPlayerId: rightId, type: "NEUTRAL", reasonTag: "no-direct-relationship" });
    }
  }
  const unique = new Map(edges.map((edge) => [`${edge.fromPlayerId}|${edge.toPlayerId}|${edge.type}|${edge.reasonTag}`, edge]));
  return { edges: [...unique.values()] };
}

/** Used when a future pack gives one player multiple rules; cross-player conflict stays allowed. */
export function hardIncompatibilityReasons(rules: readonly Pick<SecretRule, "incompatibilityTags">[]) {
  const reasons = new Set<string>();
  for (let left = 0; left < rules.length; left++) for (let right = left + 1; right < rules.length; right++) {
    for (const leftTag of rules[left]!.incompatibilityTags) for (const rightTag of rules[right]!.incompatibilityTags) {
      const [leftIntent, ...leftParts] = leftTag.split(":"); const [rightIntent, ...rightParts] = rightTag.split(":");
      const subject = leftParts.join(":");
      if (subject === rightParts.join(":") && ((leftIntent === "require" && rightIntent === "avoid") || (leftIntent === "avoid" && rightIntent === "require"))) reasons.add(subject);
    }
  }
  return [...reasons];
}
function validateSet(assignments: ReadonlyMap<string, SecretRule>, players: readonly ActivePlayer[], capabilities: ReadonlySet<MiniGameCapability>) {
  const errors: string[] = [];
  const playerIds = new Set(players.map((player) => player.playerId));
  if (players.length < 4 || players.length > 10 || assignments.size !== players.length) errors.push("invalid-player-count");
  const rules = [...assignments.values()];
  if (new Set(rules.map((rule) => rule.templateId)).size !== rules.length) errors.push("duplicate-template");
  if (new Set(rules.map((rule) => rule.identity)).size !== rules.length) errors.push("duplicate-identity");
  for (const rule of rules) {
    const template = ALL_RULE_TEMPLATE_BY_ID.get(rule.templateId);
    if (!template || !template.requiredCapabilities.every((capability) => capabilities.has(capability))) errors.push(`unsupported:${rule.templateId}`);
    if (rule.targetPlayerId && (!playerIds.has(rule.targetPlayerId) || rule.targetPlayerId === [...assignments.entries()].find(([, candidate]) => candidate.id === rule.id)?.[0])) errors.push(`invalid-target:${rule.templateId}`);
  }
  if (rules.every((rule) => rule.category === "sabotage") || rules.every((rule) => rule.category === "cooperation")) errors.push("one-note-composition");
  return errors;
}
function scoreSet(assignments: ReadonlyMap<string, SecretRule>, graph: RelationshipGraph, history: RuleHistory) {
  const rules = [...assignments.values()];
  const categories = new Set(rules.map((rule) => rule.category));
  const targets = new Set(rules.flatMap((rule) => rule.targetPlayerId ? [rule.targetPlayerId] : []));
  const rarities = new Set(rules.map((rule) => rule.rarity));
  const difficulties = new Set(rules.map((rule) => rule.difficulty));
  const relationshipTypes = new Set(graph.edges.map((edge) => edge.type));
  let score = categories.size * 9 + targets.size * 3 + rarities.size * 2 + difficulties.size * 2 + relationshipTypes.size * 4;
  score += graph.edges.filter((edge) => ["CONFLICTS_WITH", "SUPPORTS", "DEPENDS_ON", "PROTECTS", "BLOCKS"].includes(edge.type)).length * 2;
  for (const [playerId, rule] of assignments) {
    const recent = history.get(playerId) ?? [];
    if (recent.some((entry) => entry.templateId === rule.templateId)) score -= 18;
    if (recent.some((entry) => entry.identity === rule.identity)) score -= 35;
    if (recent[0]?.category === rule.category) score -= 5;
  }
  const targetCounts = new Map<string, number>();
  for (const rule of rules) if (rule.targetPlayerId) targetCounts.set(rule.targetPlayerId, (targetCounts.get(rule.targetPlayerId) ?? 0) + 1);
  for (const count of targetCounts.values()) if (count > 2) score -= (count - 2) * 9;
  return score;
}

function relationshipPlan(miniGameId: string, chaos: RoomSettings["chaos"], attempt: number, players: readonly ActivePlayer[], history: RuleHistory) {
  const pair = miniGameId === THE_BUTTON_MINI_GAME.id ? ["BUTTON_REACH_VALUE", "BUTTON_AVOID_VALUE"] : ["PERSONAL_RECOVER_VALUE", "AVOID_PUBLIC_VALUE"];
  const conflictFresh = players.slice(0, 2).every((player, index) => !(history.get(player.playerId) ?? []).some((entry) => entry.templateId === pair[index]));
  if (chaos !== "chill" && attempt < 8 && conflictFresh) return pair;
  if (chaos === "chill" && attempt < 4) return ["COOP_HELP_TARGET_COMPLETE", "PROTECT_TARGET_TURN"];
  return [];
}
function candidate(input: GenerateRuleSetInput, attempt: number): CandidateSet {
  const random = seededRandom(`${input.seed}:${input.roundNumber}:${input.miniGameId}:${attempt}`);
  const capabilities = new Set(input.capabilities);
  const eligible = eligibleTemplates(input.miniGameId, capabilities, input.buttonMode ?? CLASSIC_BUTTON_MODE);
  const history: RuleHistory = input.history ?? new Map<string, readonly RuleHistoryEntry[]>();
  const assignments = new Map<string, SecretRule>();
  const usedTemplates = new Set<string>();
  const targetLoads = new Map<string, number>();
  const plan = relationshipPlan(input.miniGameId, input.settings.chaos, attempt, input.players, history);
  const plannedValue = random.pick([7, 9, 11, 13, 17]);
  for (const [index, owner] of input.players.entries()) {
    const recent = history.get(owner.playerId) ?? [];
    const planned = plan[index] ? ALL_RULE_TEMPLATE_BY_ID.get(plan[index]!) : undefined;
    const pool = eligible.filter((template) => !usedTemplates.has(template.id));
    const fresh = pool.filter((template) => !recent.slice(0, 5).some((entry) => entry.templateId === template.id));
    const choices = fresh.length >= Math.min(4, pool.length) ? fresh : pool;
    const template = planned && choices.includes(planned) ? planned : weightedPick(choices, (item) => {
      const category = CATEGORY_WEIGHTS[input.settings.chaos][item.category] ?? 0;
      const rarity = item.rarity === "wild" ? (input.settings.chaos === "chaos" ? 2.2 : input.settings.chaos === "normal" ? 0.45 : 0.04) : 1;
      return item.baseWeight * category * rarity;
    }, random);
    usedTemplates.add(template.id);
    const resolved = resolveTarget(template.selector, owner, input.players, random, targetLoads, recent);
    const context: RuleGenerationContext = { miniGameId: input.miniGameId, capabilities, players: input.players, owner, target: resolved.target, secondaryTarget: resolved.secondary, plannedValue: plan.includes(template.id) ? plannedValue : null, random };
    const parameters = template.generateParameters(context);
    if (!template.validate(context, parameters)) continue;
    assignments.set(owner.playerId, generatedRule(template, context, parameters, `${input.seed}:${input.roundNumber}:${owner.playerId}:${template.id}`));
  }
  const graph = buildRelationshipGraph(assignments);
  const errors = validateSet(assignments, input.players, capabilities);
  return { assignments, graph, valid: errors.length === 0, validationErrors: errors, qualityScore: scoreSet(assignments, graph, history) };
}

function safeFallback(input: GenerateRuleSetInput): CandidateSet {
  const safeIds = input.miniGameId === THE_BUTTON_MINI_GAME.id
    ? ["BUTTON_PRESS_EXACTLY", "BUTTON_TARGET_AT_LEAST", "BUTTON_FIRST_PRESS", "BUTTON_REACH_VALUE", "BUTTON_PRESS_WHILE_EVEN", "BUTTON_TARGET_EXACTLY", "BUTTON_PRESS_BEFORE_VALUE", "BUTTON_DISTINCT_PLAYERS", "BUTTON_FINAL_PRESS", "BUTTON_PRESS_NO_MORE"]
    : ["PERSONAL_EXACT_ACTIONS", "COOP_HELP_TARGET_COMPLETE", "PERSONAL_FIRST_ACTION", "PROTECT_TARGET_TURN", "PERSONAL_UNIQUE_OPTION", "TARGET_MATCH_ACTIONS", "TIMING_ACT_BEFORE", "SEQUENCE_POSITION", "PREDICT_FINAL_ACTOR", "PERSONAL_PASS_EXACTLY"];
  const random = seededRandom(`${input.seed}:${input.roundNumber}:${input.miniGameId}:fallback`);
  const capabilities = new Set(input.capabilities);
  const assignments = new Map<string, SecretRule>();
  const targetLoads = new Map<string, number>();
  for (const [index, owner] of input.players.entries()) {
    const template = ALL_RULE_TEMPLATE_BY_ID.get(safeIds[index]!)!;
    const resolved = resolveTarget(template.selector, owner, input.players, random, targetLoads, input.history?.get(owner.playerId) ?? []);
    const context: RuleGenerationContext = { miniGameId: input.miniGameId, capabilities, players: input.players, owner, target: resolved.target, secondaryTarget: resolved.secondary, plannedValue: null, random };
    const parameters = template.generateParameters(context);
    assignments.set(owner.playerId, generatedRule(template, context, parameters, `${input.seed}:${input.roundNumber}:${owner.playerId}:fallback`));
  }
  const graph = buildRelationshipGraph(assignments);
  const errors = validateSet(assignments, input.players, capabilities);
  return { assignments, graph, valid: errors.length === 0, validationErrors: errors, qualityScore: scoreSet(assignments, graph, input.history ?? new Map()) };
}

export function generateRuleSet(input: GenerateRuleSetInput): GeneratedRuleSet {
  const started = performance.now();
  if (input.miniGameId === THE_BUTTON_MINI_GAME.id && !BUTTON_MODE_CONFIG[input.buttonMode ?? CLASSIC_BUTTON_MODE].playable) {
    throw new Error(`Button mode ${input.buttonMode} is not playable.`);
  }
  if (input.players.length < 4 || input.players.length > 10) throw new Error("Rule generation requires 4–10 active players.");
  if (new Set(input.players.map((player) => player.playerId)).size !== input.players.length) throw new Error("Active player identities must be unique.");
  let best: CandidateSet | null = null;
  let rejected = 0;
  let attempts = 0;
  for (; attempts < MAX_GENERATION_ATTEMPTS; attempts++) {
    const generated = candidate(input, attempts);
    if (!generated.valid) { rejected++; continue; }
    if (!best || generated.qualityScore > best.qualityScore) best = generated;
  }
  let usedFallback = false;
  if (!best) { best = safeFallback(input); usedFallback = true; }
  if (!best.valid) throw new Error(`Safe rule fallback failed: ${best.validationErrors.join(", ")}`);
  const roundId = deterministicUuid(`${input.seed}:${input.roundNumber}:${input.miniGameId}:round`);
  const privateAssignments = new Map<string, PrivatePlayerRoundState>();
  const historyEntries = new Map<string, RuleHistoryEntry>();
  for (const [playerId, rule] of best.assignments) {
    const target = rule.parameters.actionCount ?? null;
    const privateState = PrivatePlayerRoundStateSchema.parse({
      roundId, roundNumber: input.roundNumber, miniGameId: input.miniGameId, playerId, secretRule: rule,
      privateKnowledge: rule.category === "private_knowledge" ? [{ id: deterministicUuid(`${rule.id}:knowledge`), title: "PRIVATE INFORMATION", description: rule.description }] : [],
      hiddenAbilities: rule.category === "hidden_ability" && rule.parameters.ability ? [{ id: deterministicUuid(`${rule.id}:ability`), title: "SECRET ABILITY", ability: rule.parameters.ability, description: rule.description, usesRemaining: rule.parameters.uses ?? 1 }] : [],
      privateProgress: { status: "not_started", current: target === null ? null : 0, target, summary: "NOT STARTED" },
      privateTargetPlayerId: rule.targetPlayerId ?? null, acknowledgedAt: null,
    });
    privateAssignments.set(playerId, privateState);
    historyEntries.set(playerId, { templateId: rule.templateId, identity: rule.identity, category: rule.category, ...(rule.targetPlayerId ? { targetPlayerId: rule.targetPlayerId } : {}) });
  }
  return {
    assignments: privateAssignments, allSecretRules: best.assignments, relationshipGraph: best.graph, generationSeed: input.seed,
    validationMetadata: { attempts, usedFallback, rejectedCandidates: rejected, durationMs: performance.now() - started, qualityScore: best.qualityScore, validationErrors: best.validationErrors },
    historyEntries,
  };
}

export function appendRuleHistory(history: Map<string, RuleHistoryEntry[]>, entries: ReadonlyMap<string, RuleHistoryEntry>) {
  for (const [playerId, entry] of entries) history.set(playerId, [entry, ...(history.get(playerId) ?? [])].slice(0, RULE_HISTORY_LIMIT));
}
