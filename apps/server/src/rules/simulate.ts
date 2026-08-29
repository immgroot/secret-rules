import { appendRuleHistory, CORE_PREVIEW_MINI_GAME, generateRuleSet } from "./engine.ts";
import { pathToFileURL } from "node:url";
import { RELATIONSHIP_TYPES } from "@secret-rules/shared";
import { categoryCounts, concreteVariantEstimate, RULE_TEMPLATES } from "./catalog.ts";
import { deterministicUuid } from "./rng.ts";
import type { ActivePlayer, RuleHistoryEntry } from "./types.ts";

export type SimulationSummary = {
  baseTemplateFamilies: number;
  categories: ReturnType<typeof categoryCounts>;
  concreteVariants: Record<string, number>;
  relationshipTypes: string[];
  simulatedAssignmentSets: number;
  totalIndividualAssignments: number;
  duplicateSets: number;
  invalidGenerationSets: number;
  fallbackSets: number;
  duplicateRate: number;
  invalidGenerationRate: number;
  fallbackRate: number;
  averageGenerationTimeMs: number;
  worstGenerationTimeMs: number;
  categoryAssignmentsByChaos: Record<string, Record<string, number>>;
};

export function mockPlayers(count: number): ActivePlayer[] {
  const names = ["GROOT", "ESTRIX", "MILO", "JUNE", "RAVEN", "NOVA", "SOL", "PIPER", "ORBIT", "ZED"];
  return names.slice(0, count).map((displayName, index) => ({ playerId: deterministicUuid(`dev-player:${index}`), displayName, isHost: index === 0 }));
}
export function runRuleSimulation(setsPerCombination = 100): SimulationSummary {
  const relationships = new Set<string>();
  const categoryAssignmentsByChaos: Record<string, Record<string, number>> = { chill: {}, normal: {}, chaos: {} };
  let sets = 0; let assignments = 0; let duplicates = 0; let invalid = 0; let fallbacks = 0; let totalMs = 0; let worstMs = 0;
  for (const playerCount of [4, 6, 8, 10]) for (const chaos of ["chill", "normal", "chaos"] as const) {
    const players = mockPlayers(playerCount);
    const history = new Map<string, RuleHistoryEntry[]>();
    for (let index = 0; index < setsPerCombination; index++) {
      sets++;
      try {
        const generated = generateRuleSet({ seed: `simulation:${playerCount}:${chaos}:${index}`, roundNumber: index + 1, miniGameId: CORE_PREVIEW_MINI_GAME.id, players, settings: { chaos }, capabilities: CORE_PREVIEW_MINI_GAME.capabilities, history });
        const rules = [...generated.allSecretRules.values()];
        assignments += rules.length;
        if (new Set(rules.map((rule) => rule.identity)).size !== rules.length || new Set(rules.map((rule) => rule.templateId)).size !== rules.length) duplicates++;
        if (generated.validationMetadata.usedFallback) fallbacks++;
        totalMs += generated.validationMetadata.durationMs;
        worstMs = Math.max(worstMs, generated.validationMetadata.durationMs);
        for (const edge of generated.relationshipGraph.edges) relationships.add(edge.type);
        for (const rule of rules) categoryAssignmentsByChaos[chaos]![rule.category] = (categoryAssignmentsByChaos[chaos]![rule.category] ?? 0) + 1;
        appendRuleHistory(history, generated.historyEntries);
      } catch { invalid++; }
    }
  }
  const rate = (value: number) => Number((value / sets).toFixed(6));
  return {
    baseTemplateFamilies: RULE_TEMPLATES.length, categories: categoryCounts(),
    concreteVariants: Object.fromEntries([4, 6, 8, 10].map((count) => [String(count), concreteVariantEstimate(count)])),
    relationshipTypes: [...RELATIONSHIP_TYPES], simulatedAssignmentSets: sets, totalIndividualAssignments: assignments,
    duplicateSets: duplicates, invalidGenerationSets: invalid, fallbackSets: fallbacks,
    duplicateRate: rate(duplicates), invalidGenerationRate: rate(invalid), fallbackRate: rate(fallbacks),
    averageGenerationTimeMs: Number((totalMs / Math.max(1, sets - invalid)).toFixed(3)), worstGenerationTimeMs: Number(worstMs.toFixed(3)),
    categoryAssignmentsByChaos,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === "production") throw new Error("Rule simulation is disabled in production.");
  const count = Number.parseInt(process.argv.find((argument) => argument.startsWith("--sets="))?.split("=")[1] ?? "100", 10);
  console.log(JSON.stringify(runRuleSimulation(count), null, 2));
}
