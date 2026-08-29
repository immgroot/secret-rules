import type { ObservableGameEvent } from "@secret-rules/shared";
import type { RuleEvaluationContext, RuleEvaluator } from "./types.ts";

/** Shared registry contract. Phase 2 defines the lifecycle; mini-game packs register real evaluators later. */
export class RuleEvaluatorRegistry {
  private readonly evaluators = new Map<string, RuleEvaluator>();
  register(evaluator: RuleEvaluator) {
    if (this.evaluators.has(evaluator.id)) throw new Error(`Duplicate rule evaluator: ${evaluator.id}`);
    this.evaluators.set(evaluator.id, evaluator);
  }
  onGameEvent(event: ObservableGameEvent, contexts: readonly RuleEvaluationContext[]) {
    for (const context of contexts) this.evaluators.get(context.rule.evaluatorId)?.onGameEvent(event, context);
  }
  get(id: string) { return this.evaluators.get(id) ?? null; }
}
