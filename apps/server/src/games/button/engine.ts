import { randomUUID } from "node:crypto";
import type { ObservableGameEvent, PrivatePlayerRoundState } from "@secret-rules/shared";
import type { GeneratedRuleSet } from "../../rules/engine.ts";
import { evaluateButtonAssignments } from "./evaluator.ts";

export const BUTTON_TARGET = 20;
// Fallback for non-room harnesses. Live rooms use their validated room setting.
export const BUTTON_ROUND_DURATION_MS = 80_000;
export const BUTTON_COUNTDOWN_MS = 3_000;
export const BUTTON_RESOLUTION_MS = 1_200;
export const BUTTON_RECHARGE_MS = 850;

export function buttonOutcomeForCounter(counter: number) {
  return counter === BUTTON_TARGET ? "success" as const : counter > BUTTON_TARGET ? "overshoot" as const : "pending" as const;
}

export type ButtonPressRecord = {
  actionId: string; actorPlayerId: string; previousValue: number; currentValue: number;
  delta: 0 | 1 | 2; at: number; sequence: number; serverOnlyModifiers: readonly string[];
};
export type ButtonGameEvent =
  | { type: "BUTTON_PRESS_REQUESTED" | "BUTTON_PRESS_ACCEPTED"; actionId: string; actorPlayerId: string; at: number }
  | { type: "BUTTON_PRESS_RESOLVED"; actionId: string; actorPlayerId: string; delta: 0 | 1 | 2; at: number }
  | { type: "COUNTER_CHANGED"; previousValue: number; currentValue: number; delta: 0 | 1 | 2; at: number }
  | { type: "COUNTER_VALUE_REACHED"; value: number; actorPlayerId: string; at: number }
  | { type: "PLAYER_PRESSED" | "FINAL_ACTION_CHANGED"; actorPlayerId: string; at: number }
  | { type: "TIMER_THRESHOLD_REACHED"; remainingMs: number; at: number }
  | { type: "BUTTON_MODIFIER_APPLIED"; modifier: string; actorPlayerId: string; at: number }
  | { type: "ROUND_TARGET_REACHED" | "ROUND_OVERSHOT"; value: number; actorPlayerId: string; at: number }
  | { type: "ROUND_TIMEOUT"; value: number; at: number };

export function buttonGameEventsForPress(record: ButtonPressRecord): ButtonGameEvent[] {
  const events: ButtonGameEvent[] = [
    { type: "BUTTON_PRESS_REQUESTED", actionId: record.actionId, actorPlayerId: record.actorPlayerId, at: record.at },
    { type: "BUTTON_PRESS_ACCEPTED", actionId: record.actionId, actorPlayerId: record.actorPlayerId, at: record.at },
    { type: "PLAYER_PRESSED", actorPlayerId: record.actorPlayerId, at: record.at },
    { type: "BUTTON_PRESS_RESOLVED", actionId: record.actionId, actorPlayerId: record.actorPlayerId, delta: record.delta, at: record.at },
    { type: "COUNTER_CHANGED", previousValue: record.previousValue, currentValue: record.currentValue, delta: record.delta, at: record.at },
    { type: "COUNTER_VALUE_REACHED", value: record.currentValue, actorPlayerId: record.actorPlayerId, at: record.at },
    { type: "FINAL_ACTION_CHANGED", actorPlayerId: record.actorPlayerId, at: record.at },
    ...record.serverOnlyModifiers.map((modifier): ButtonGameEvent => ({ type: "BUTTON_MODIFIER_APPLIED", modifier, actorPlayerId: record.actorPlayerId, at: record.at })),
  ];
  if (record.currentValue === BUTTON_TARGET) events.push({ type: "ROUND_TARGET_REACHED", value: record.currentValue, actorPlayerId: record.actorPlayerId, at: record.at });
  if (record.currentValue > BUTTON_TARGET) events.push({ type: "ROUND_OVERSHOT", value: record.currentValue, actorPlayerId: record.actorPlayerId, at: record.at });
  return events;
}

function consumeAbility(state: PrivatePlayerRoundState, ability: "DOUBLE" | "BLOCK" | "PROTECT") {
  const index = state.hiddenAbilities.findIndex((candidate) => candidate.ability === ability && candidate.usesRemaining > 0);
  if (index < 0) return { state, consumed: false };
  const hiddenAbilities = state.hiddenAbilities.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, usesRemaining: candidate.usesRemaining - 1 } : candidate);
  return { state: { ...state, hiddenAbilities }, consumed: true };
}

export function resolveButtonPress(assignments: ReadonlyMap<string, PrivatePlayerRoundState>, actorPlayerId: string) {
  const next = new Map(assignments);
  const modifiers: string[] = [];
  const actor = next.get(actorPlayerId);
  if (!actor) return { assignments: next, delta: 1 as const, modifiers };

  const blocker = [...next.values()].find((state) => state.secretRule.templateId === "BUTTON_BLOCK" && state.secretRule.targetPlayerId === actorPlayerId && state.hiddenAbilities.some((ability) => ability.ability === "BLOCK" && ability.usesRemaining > 0));
  const protectedPress = consumeAbility(actor, "PROTECT");
  if (protectedPress.consumed) { next.set(actorPlayerId, protectedPress.state); modifiers.push("PROTECT"); }
  if (blocker) {
    const consumedBlock = consumeAbility(blocker, "BLOCK");
    next.set(blocker.playerId, consumedBlock.state);
    modifiers.push("BLOCK");
    if (!protectedPress.consumed) return { assignments: next, delta: 0 as const, modifiers };
  }

  const doubled = consumeAbility(next.get(actorPlayerId)!, "DOUBLE");
  if (doubled.consumed) {
    next.set(actorPlayerId, doubled.state);
    modifiers.push("DOUBLE");
    return { assignments: next, delta: 2 as const, modifiers };
  }
  return { assignments: next, delta: 1 as const, modifiers };
}

export function pressEvents(record: ButtonPressRecord): ObservableGameEvent[] {
  return [
    { type: "PLAYER_ACTION", actorPlayerId: record.actorPlayerId, action: "BUTTON_PRESS", at: record.at },
    { type: "PUBLIC_VALUE_CHANGED", previous: record.previousValue, current: record.currentValue, actorPlayerId: record.actorPlayerId, at: record.at },
    ...record.serverOnlyModifiers.map((ability): ObservableGameEvent => ({ type: "ABILITY_USED", actorPlayerId: record.actorPlayerId, ability, at: record.at })),
    { type: "PUBLIC_STATE_CHANGED", stateId: `button:${record.currentValue}`, at: record.at },
  ];
}

export function initializeButtonEvents(activePlayerIds: readonly string[], at: number): ObservableGameEvent[] {
  return [
    { type: "SEQUENCE_CHANGED", playerIds: [...activePlayerIds], at },
    { type: "ROUND_EVENT", event: "ROUND_PREPARED", at },
  ];
}

export function finalizeButtonAssignments(generated: GeneratedRuleSet, events: readonly ObservableGameEvent[], at: number) {
  const finalEvents: ObservableGameEvent[] = [...events, { type: "ROUND_EVENT", event: "ROUND_RESOLVED", at }];
  return { generated: { ...generated, assignments: evaluateButtonAssignments(generated.assignments, finalEvents) }, events: finalEvents };
}

export function updateButtonAssignments(generated: GeneratedRuleSet, events: readonly ObservableGameEvent[]) {
  return { ...generated, assignments: evaluateButtonAssignments(generated.assignments, events) };
}

export function sanitizedAction(record: ButtonPressRecord) {
  return [
    { actionId: randomUUID(), type: "PLAYER_PRESSED" as const, actorPlayerId: record.actorPlayerId, previousValue: null, currentValue: null, delta: null, at: record.at, sequence: record.sequence },
    { actionId: randomUUID(), type: "COUNTER_CHANGED" as const, actorPlayerId: null, previousValue: record.previousValue, currentValue: record.currentValue, delta: record.delta, at: record.at, sequence: record.sequence },
  ];
}
