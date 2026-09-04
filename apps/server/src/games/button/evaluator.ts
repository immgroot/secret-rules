import type { ButtonCardKind, ObservableGameEvent, PrivatePlayerRoundState, PrivateProgressSchema, SecretRule } from "@secret-rules/shared";
import type { z } from "zod";
import { RuleEvaluatorRegistry } from "../../rules/evaluators.ts";
import { BUTTON_RULE_TEMPLATES } from "./catalog.ts";

type Progress = z.infer<typeof PrivateProgressSchema>;
type ButtonOutcomeEvent = Extract<ObservableGameEvent, { type: "BUTTON_V2_OUTCOME" }>;
const positive = new Set<ButtonCardKind>(["PLUS_ONE", "PLUS_TWO", "PLUS_THREE"]);
const negative = new Set<ButtonCardKind>(["MINUS_ONE", "MINUS_TWO"]);
const effects = new Set<ButtonCardKind>(["SKIP", "STEAL", "INSPECT", "REVERSE", "SHIELD", "WILD"]);

function progress(current: number, target: number, isFinal: boolean, summary: string, impossible = false): Progress {
  const status = impossible ? "failed" : current >= target ? "completed" : isFinal ? "failed" : current > 0 ? "in_progress" : "not_started";
  return { status, current, target, summary };
}

export function evaluateButtonRule(rule: SecretRule, ownerPlayerId: string, events: readonly ObservableGameEvent[]): Progress {
  const outcomes = events.filter((event): event is ButtonOutcomeEvent => event.type === "BUTTON_V2_OUTCOME");
  const mine = outcomes.filter((event) => event.actorPlayerId === ownerPlayerId);
  const isFinal = events.some((event) => event.type === "ROUND_EVENT" && event.event === "ROUND_RESOLVED");
  const target = rule.parameters.actionCount ?? 1;
  const count = (outcome: ButtonOutcomeEvent["outcome"]) => mine.filter((event) => event.outcome === outcome).length;
  const uniqueOpponents = (accepted: readonly ButtonOutcomeEvent["outcome"][]) => new Set(mine.filter((event) => accepted.includes(event.outcome) && event.opponentPlayerId).map((event) => event.opponentPlayerId!)).size;
  const resolved = mine.filter((event) => event.outcome === "CARD_RESOLVED");
  const successfulClaims = mine.filter((event) => ["BLUFF_SUCCEEDED", "TRUTHFUL", "FALSELY_ACCUSED"].includes(event.outcome));
  let current = 0;
  let impossible = false;

  switch (rule.templateId) {
    case "BUTTON_V2_BLUFF_SUCCESS": current = count("BLUFF_SUCCEEDED"); break;
    case "BUTTON_V2_CORRECT_CHALLENGE": current = count("CORRECT_CHALLENGE"); break;
    case "BUTTON_V2_FALSELY_ACCUSED": current = count("FALSELY_ACCUSED"); break;
    case "BUTTON_V2_NEGATIVE_RESOLVED": current = resolved.filter((event) => negative.has(event.actualCard)).length; break;
    case "BUTTON_V2_TARGETED_RESOLVED": current = resolved.filter((event) => event.targeted).length; break;
    case "BUTTON_V2_DISTINCT_CLAIMS": current = new Set(successfulClaims.map((event) => event.claimedCard)).size; break;
    case "BUTTON_V2_CHALLENGE_DIFFERENT_PLAYERS": current = uniqueOpponents(["CORRECT_CHALLENGE"]); break;
    case "BUTTON_V2_TRUTHFUL_RESOLUTIONS": current = count("TRUTHFUL") + count("FALSELY_ACCUSED"); break;
    case "BUTTON_V2_POSITIVE_RESOLVED": current = resolved.filter((event) => positive.has(event.actualCard)).length; break;
    case "BUTTON_V2_WIN_CHALLENGES": current = count("CORRECT_CHALLENGE") + count("FALSELY_ACCUSED"); break;
    case "BUTTON_V2_EFFECT_TARGET": current = resolved.filter((event) => effects.has(event.actualCard) && event.opponentPlayerId === rule.targetPlayerId).length; break;
    case "BUTTON_V2_FALSELY_ACCUSED_BY_TARGET": current = mine.filter((event) => event.outcome === "FALSELY_ACCUSED" && event.opponentPlayerId === rule.targetPlayerId).length; break;
    case "BUTTON_V2_BLUFF_UNCAUGHT": current = count("BLUFF_SUCCEEDED"); impossible = count("BLUFF_CAUGHT") > 0; break;
    case "BUTTON_V2_CATCH_DISTINCT": current = uniqueOpponents(["CORRECT_CHALLENGE"]); break;
    case "BUTTON_V2_FALSE_AND_CATCH": current = Math.min(1, count("FALSELY_ACCUSED")) + Math.min(1, count("CORRECT_CHALLENGE")); break;
    case "BUTTON_V2_BLUFF_DISTINCT_CLAIMS": current = new Set(mine.filter((event) => event.outcome === "BLUFF_SUCCEEDED").map((event) => event.claimedCard)).size; break;
    case "BUTTON_V2_WIN_THREE_CHALLENGES": current = count("CORRECT_CHALLENGE") + count("FALSELY_ACCUSED"); break;
    case "BUTTON_V2_EFFECT_VARIETY": current = new Set(resolved.filter((event) => effects.has(event.actualCard)).map((event) => event.actualCard)).size; break;
    case "BUTTON_V2_SOCIAL_TWO_OPPONENTS": current = uniqueOpponents(["CORRECT_CHALLENGE", "FALSELY_ACCUSED"]); break;
    case "BUTTON_V2_MIXED_MOVEMENT": current = Number(resolved.some((event) => positive.has(event.actualCard))) + Number(resolved.some((event) => negative.has(event.actualCard))); break;
    case "BUTTON_V2_TRUTH_STREAK": current = count("TRUTHFUL") + count("FALSELY_ACCUSED"); impossible = mine.some((event) => event.outcome === "BLUFF_SUCCEEDED" || event.outcome === "BLUFF_CAUGHT"); break;
    case "BUTTON_V2_NEGATIVE_BLUFFS": current = mine.filter((event) => event.outcome === "BLUFF_SUCCEEDED" && negative.has(event.actualCard)).length; break;
    default: impossible = true;
  }
  return progress(current, target, isFinal, `${current} / ${target}`, impossible);
}

export function createButtonEvaluatorRegistry() {
  const registry = new RuleEvaluatorRegistry();
  for (const template of BUTTON_RULE_TEMPLATES) registry.register({
    id: `rule:${template.id.toLowerCase().replaceAll("_", "-")}`,
    onGameEvent: () => {},
    evaluateProgress: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events),
    evaluateSuccess: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events).status === "completed",
    evaluateFailure: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events).status === "failed",
  });
  return registry;
}

export function evaluateButtonAssignments(assignments: ReadonlyMap<string, PrivatePlayerRoundState>, events: readonly ObservableGameEvent[]) {
  return new Map([...assignments].map(([playerId, state]) => {
    const next = evaluateButtonRule(state.secretRule, playerId, events);
    const changed = JSON.stringify(next) !== JSON.stringify(state.privateProgress);
    return [playerId, changed ? { ...state, revision: state.revision + 1, privateProgress: next } : state];
  }));
}
