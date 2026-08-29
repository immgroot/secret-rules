import assert from "node:assert/strict";
import test from "node:test";
import { RELATIONSHIP_TYPES } from "@secret-rules/shared";
import { categoryCounts, concreteVariantEstimate, RULE_TEMPLATES } from "../src/rules/catalog.ts";
import { appendRuleHistory, CORE_PREVIEW_MINI_GAME, generateRuleSet, hardIncompatibilityReasons } from "../src/rules/engine.ts";
import { mockPlayers, runRuleSimulation } from "../src/rules/simulate.ts";
import type { RuleHistoryEntry } from "../src/rules/types.ts";

test("catalog contains 100 distinct, balanced, capability-aware template families", () => {
  assert.equal(RULE_TEMPLATES.length, 100);
  assert.equal(new Set(RULE_TEMPLATES.map((template) => template.id)).size, 100);
  assert.deepEqual(categoryCounts(), {
    personal: 10, target: 10, avoidance: 8, timing: 8, sequence: 8, cooperation: 8, sabotage: 8,
    protection: 6, social: 8, prediction: 5, private_knowledge: 5, hidden_ability: 6, conditional: 6, wild: 4,
  });
  assert.deepEqual([4, 6, 8, 10].map(concreteVariantEstimate), [494, 770, 1086, 1442]);
  for (const template of RULE_TEMPLATES) {
    assert.ok(template.parameterSchema);
    assert.ok(template.requiredCapabilities.length > 0 || template.category === "cooperation");
    assert.match(template.id, /^[A-Z0-9_]+$/);
  }
});

test("same seed, players, settings, capabilities and history reproduce assignments", () => {
  const input = { seed: "deterministic-seed", roundNumber: 3, miniGameId: CORE_PREVIEW_MINI_GAME.id, players: mockPlayers(8), settings: { chaos: "normal" as const }, capabilities: CORE_PREVIEW_MINI_GAME.capabilities };
  const first = generateRuleSet(input);
  const second = generateRuleSet(input);
  assert.deepEqual([...first.allSecretRules], [...second.allSecretRules]);
  assert.deepEqual(first.relationshipGraph, second.relationshipGraph);
  assert.equal(first.generationSeed, "deterministic-seed");
  assert.equal(first.validationMetadata.usedFallback, false);
});

test("assignments are unique, valid, active-player-only and rotate recent history", () => {
  for (const count of [4, 6, 8, 10]) {
    const players = mockPlayers(count);
    const history = new Map<string, RuleHistoryEntry[]>();
    const first = generateRuleSet({ seed: `round-one-${count}`, roundNumber: 1, miniGameId: CORE_PREVIEW_MINI_GAME.id, players, settings: { chaos: "normal" }, capabilities: CORE_PREVIEW_MINI_GAME.capabilities, history });
    appendRuleHistory(history, first.historyEntries);
    const second = generateRuleSet({ seed: `round-two-${count}`, roundNumber: 2, miniGameId: CORE_PREVIEW_MINI_GAME.id, players, settings: { chaos: "normal" }, capabilities: CORE_PREVIEW_MINI_GAME.capabilities, history });
    const activeIds = new Set(players.map((player) => player.playerId));
    assert.equal(second.assignments.size, count);
    assert.equal(new Set([...second.allSecretRules.values()].map((rule) => rule.identity)).size, count);
    assert.equal(new Set([...second.allSecretRules.values()].map((rule) => rule.templateId)).size, count);
    for (const [playerId, rule] of second.allSecretRules) {
      assert.ok(activeIds.has(playerId));
      assert.ok(!rule.targetPlayerId || activeIds.has(rule.targetPlayerId));
      assert.notEqual(rule.targetPlayerId, playerId);
      assert.notEqual(rule.templateId, first.allSecretRules.get(playerId)?.templateId);
    }
  }
});

test("chaos materially changes distributions while every relationship type is modeled", () => {
  const summary = runRuleSimulation(10);
  const chill = summary.categoryAssignmentsByChaos.chill!;
  const chaos = summary.categoryAssignmentsByChaos.chaos!;
  assert.ok((chaos.wild ?? 0) > (chill.wild ?? 0));
  assert.ok((chaos.sabotage ?? 0) > (chill.sabotage ?? 0));
  assert.ok((chill.cooperation ?? 0) + (chill.protection ?? 0) > (chaos.cooperation ?? 0) + (chaos.protection ?? 0));
  assert.equal(summary.duplicateSets, 0);
  assert.equal(summary.invalidGenerationSets, 0);
  assert.equal(summary.fallbackSets, 0);
  assert.deepEqual([...RELATIONSHIP_TYPES], ["CONFLICTS_WITH", "SUPPORTS", "DEPENDS_ON", "BLOCKS", "PROTECTS", "TARGETS", "COMPETES_WITH", "NEUTRAL"]);
});

test("hard incompatibility metadata is separate from fun cross-player conflict", () => {
  assert.deepEqual(hardIncompatibilityReasons([
    { incompatibilityTags: ["require:final-actor:self"] },
    { incompatibilityTags: ["avoid:final-actor:self"] },
  ]), ["final-actor:self"]);
  assert.deepEqual(hardIncompatibilityReasons([
    { incompatibilityTags: ["require:final-actor:self"] },
    { incompatibilityTags: ["avoid:first-actor:self"] },
  ]), []);
});
