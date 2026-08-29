import type { ObservableGameEvent, PrivatePlayerRoundState, PrivateProgressSchema, SecretRule } from "@secret-rules/shared";
import type { z } from "zod";
import { RuleEvaluatorRegistry } from "../../rules/evaluators.ts";
import type { RuleEvaluationContext } from "../../rules/types.ts";
import { BUTTON_RULE_TEMPLATES } from "./catalog.ts";

type Progress = z.infer<typeof PrivateProgressSchema>;
type Press = { actorPlayerId: string; previous: number; current: number; at: number };

function presses(events: readonly ObservableGameEvent[]) {
  return events.flatMap((event): Press[] => event.type === "PUBLIC_VALUE_CHANGED" && event.actorPlayerId
    ? [{ actorPlayerId: event.actorPlayerId, previous: event.previous, current: event.current, at: event.at }]
    : []);
}
function final(events: readonly ObservableGameEvent[]) {
  return events.some((event) => event.type === "ROUND_EVENT" && event.event === "ROUND_RESOLVED");
}
function result(success: boolean, isFinal: boolean, summary: string, current: number | null = null, target: number | null = null, permanentFailure = false): Progress {
  if (success) return { status: "completed", current, target, summary };
  if (permanentFailure || isFinal) return { status: "failed", current, target, summary };
  return { status: "still_possible", current, target, summary };
}
function currentResult(success: boolean, isFinal: boolean, summary: string, current: number | null = null, target: number | null = null): Progress {
  if (isFinal) return result(success, true, summary, current, target);
  return { status: success ? "currently_satisfied" : "still_possible", current, target, summary };
}

export function evaluateButtonRule(rule: SecretRule, ownerPlayerId: string, events: readonly ObservableGameEvent[]): Progress {
  const history = presses(events);
  const isFinal = final(events);
  const mine = history.filter((press) => press.actorPlayerId === ownerPlayerId);
  const targetId = rule.targetPlayerId;
  const secondId = rule.secondaryTargetPlayerId;
  const targetPresses = targetId ? history.filter((press) => press.actorPlayerId === targetId) : [];
  const count = rule.parameters.actionCount ?? 1;
  const value = rule.parameters.publicValue ?? 13;
  const first = history[0]?.actorPlayerId ?? null;
  const last = history.at(-1)?.actorPlayerId ?? null;
  const reached = history.some((press) => press.current === value);
  const ownerReached = history.some((press) => press.actorPlayerId === ownerPlayerId && press.current === value);
  const follows = (actor: string, leader: string) => history.some((press, index) => press.actorPlayerId === actor && history[index - 1]?.actorPlayerId === leader);
  const ownerTargetOwner = targetId ? history.some((press, index) => press.actorPlayerId === ownerPlayerId
    && history[index - 1]?.actorPlayerId === targetId
    && history[index - 2]?.actorPlayerId === ownerPlayerId) : false;
  const targetBetweenDifferent = targetId ? history.some((press, index) => {
    const before = history[index - 1]?.actorPlayerId;
    const after = history[index + 1]?.actorPlayerId;
    return press.actorPlayerId === targetId && Boolean(before && after && before !== after);
  }) : false;
  const threeDistinct = history.some((_press, index) => index >= 2
    && new Set(history.slice(index - 2, index + 1).map((entry) => entry.actorPlayerId)).size === 3);
  const indexOf = (actor: string | undefined) => actor ? history.findIndex((press) => press.actorPlayerId === actor) : -1;
  const beforeValue = history.filter((press) => press.current < value).at(-1)?.actorPlayerId ?? null;
  const crossedValue = history.find((press) => press.previous < value && press.current >= value);

  switch (rule.templateId) {
    case "BUTTON_PRESS_EXACTLY": return mine.length > count ? result(false, isFinal, `${mine.length} / ${count} PRESSES`, mine.length, count, true) : currentResult(mine.length === count, isFinal, `${mine.length} / ${count} PRESSES`, mine.length, count);
    case "BUTTON_PRESS_AT_LEAST": return result(mine.length >= count, isFinal, `${mine.length} / ${count} PRESSES`, mine.length, count);
    case "BUTTON_PRESS_NO_MORE": return mine.length > count ? result(false, isFinal, `${mine.length} / ${count} MAX`, mine.length, count, true) : currentResult(true, isFinal, `${mine.length} / ${count} MAX`, mine.length, count);
    case "BUTTON_NEVER_PRESS":
    case "BUTTON_FINISH_WITHOUT_PRESSING": return mine.length > 0 ? result(false, isFinal, "YOU PRESSED", mine.length, 1, true) : currentResult(true, isFinal, "NO PRESSES");
    case "BUTTON_FIRST_PRESS": return first ? result(first === ownerPlayerId, isFinal, first === ownerPlayerId ? "FIRST PRESS SECURED" : "FIRST PRESS MISSED", null, null, first !== ownerPlayerId) : result(false, false, "WAITING FOR FIRST PRESS");
    case "BUTTON_FINAL_PRESS": return currentResult(last === ownerPlayerId, isFinal, last === ownerPlayerId ? "CURRENTLY LAST" : "NOT CURRENTLY LAST");
    case "BUTTON_PRESS_ONCE": return mine.length > 1 ? result(false, isFinal, `${mine.length} PRESSES`, mine.length, 1, true) : currentResult(mine.length === 1, isFinal, `${mine.length} / 1 PRESS`, mine.length, 1);
    case "BUTTON_TARGET_FIRST": return first ? result(first === targetId, isFinal, first === targetId ? "TARGET PRESSED FIRST" : "TARGET MISSED FIRST", null, null, first !== targetId) : result(false, false, "WAITING FOR FIRST PRESS");
    case "BUTTON_TARGET_LAST": return currentResult(last === targetId, isFinal, last === targetId ? "TARGET CURRENTLY LAST" : "TARGET NOT LAST");
    case "BUTTON_PREVENT_TARGET_LAST": return currentResult(history.length > 0 && last !== targetId, isFinal, last === targetId ? "TARGET CURRENTLY LAST" : "TARGET NOT LAST");
    case "BUTTON_TARGET_EXACTLY": return targetPresses.length > count ? result(false, isFinal, `${targetPresses.length} / ${count} TARGET PRESSES`, targetPresses.length, count, true) : currentResult(targetPresses.length === count, isFinal, `${targetPresses.length} / ${count} TARGET PRESSES`, targetPresses.length, count);
    case "BUTTON_TARGET_AT_LEAST": return result(targetPresses.length >= count, isFinal, `${targetPresses.length} / ${count} TARGET PRESSES`, targetPresses.length, count);
    case "BUTTON_TARGET_NO_SECOND_PRESS": return targetPresses.length > 1 ? result(false, isFinal, "TARGET PRESSED AGAIN", targetPresses.length, 1, true) : currentResult(targetPresses.length === 1, isFinal, targetPresses.length ? "TARGET STOPPED AT ONE" : "WAITING FOR TARGET");
    case "BUTTON_TARGET_NEVER_PRESSES": return targetPresses.length > 0 ? result(false, isFinal, "TARGET PRESSED", targetPresses.length, 1, true) : currentResult(true, isFinal, "TARGET HAS NOT PRESSED");
    case "BUTTON_IMMEDIATELY_AFTER_TARGET": return result(targetId ? follows(ownerPlayerId, targetId) : false, isFinal, targetId && follows(ownerPlayerId, targetId) ? "SEQUENCE COMPLETE" : "SEQUENCE OPEN");
    case "BUTTON_NOT_AFTER_TARGET": { const failed = targetId ? follows(ownerPlayerId, targetId) : false; return failed ? result(false, isFinal, "YOU FOLLOWED THE TARGET", null, null, true) : currentResult(true, isFinal, "SEQUENCE CLEAN"); }
    case "BUTTON_TARGET_A_BEFORE_B": { const a = indexOf(targetId); const b = indexOf(secondId); const failed = b >= 0 && (a < 0 || b < a); return failed ? result(false, isFinal, "ORDER BROKEN", null, null, true) : result(a >= 0 && b > a, isFinal, a >= 0 ? "FIRST TARGET ACTED" : "WAITING FOR ORDER"); }
    case "BUTTON_TARGET_A_AFTER_B": { const a = indexOf(targetId); const b = indexOf(secondId); return result(a >= 0 && b >= 0 && a > b, isFinal, b >= 0 ? "ORDER IN MOTION" : "WAITING FOR ORDER"); }
    case "BUTTON_RETURN_AFTER_TARGET": return result(ownerTargetOwner, isFinal, ownerTargetOwner ? "SEQUENCE COMPLETE" : "BUILD YOU → TARGET → YOU");
    case "BUTTON_TARGET_BETWEEN_DIFFERENT": return result(targetBetweenDifferent, isFinal, targetBetweenDifferent ? "TARGET SANDWICH COMPLETE" : "BUILD THE TARGET SANDWICH");
    case "BUTTON_THREE_DISTINCT_IN_ROW": return result(threeDistinct, isFinal, threeDistinct ? "THREE UNIQUE PRESSERS" : "BUILD A THREE-PLAYER RUN");
    case "BUTTON_EXACTLY_ONCE_AFTER_TARGET": { const followCount = targetId ? history.filter((press, index) => press.actorPlayerId === ownerPlayerId && history[index - 1]?.actorPlayerId === targetId).length : 0; return followCount > 1 ? result(false, isFinal, `${followCount} FOLLOW-UPS`, followCount, 1, true) : currentResult(followCount === 1, isFinal, `${followCount} / 1 FOLLOW-UP`, followCount, 1); }
    case "BUTTON_ONLY_AFTER_TARGET": { const bad = mine.some((press) => history[history.indexOf(press) - 1]?.actorPlayerId !== targetId); return bad ? result(false, isFinal, "UNAUTHORIZED SEQUENCE", null, null, true) : currentResult(mine.length > 0, isFinal, mine.length ? "ONLY FOLLOWED TARGET" : "WAITING TO FOLLOW"); }
    case "BUTTON_AVOID_VALUE": return reached ? result(false, isFinal, `COUNTER HIT ${value}`, null, null, true) : currentResult(true, isFinal, `${value} AVOIDED`);
    case "BUTTON_REACH_VALUE": return result(reached, isFinal, reached ? `${value} REACHED` : `WAITING FOR ${value}`);
    case "BUTTON_OWNER_REACH_VALUE": return result(ownerReached, isFinal, ownerReached ? `YOU HIT ${value}` : `WAITING TO HIT ${value}`);
    case "BUTTON_PRESS_WHILE_EVEN": return result(mine.some((press) => press.previous % 2 === 0), isFinal, "PRESS FROM EVEN");
    case "BUTTON_PRESS_WHILE_ODD": return result(mine.some((press) => press.previous % 2 !== 0), isFinal, "PRESS FROM ODD");
    case "BUTTON_LAND_EVEN": return result(mine.some((press) => press.current % 2 === 0), isFinal, "LAND ON EVEN");
    case "BUTTON_LAND_ODD": return result(mine.some((press) => press.current % 2 !== 0), isFinal, "LAND ON ODD");
    case "BUTTON_NO_PRESS_AFTER_VALUE": { const failed = mine.some((press) => press.previous >= value); return failed ? result(false, isFinal, `PRESSED AFTER ${value}`, null, null, true) : currentResult(true, isFinal, `NO PRESS AFTER ${value}`); }
    case "BUTTON_PRESS_AFTER_VALUE": return result(mine.some((press) => press.previous >= value), isFinal, `PRESS AFTER ${value}`);
    case "BUTTON_PRESS_BEFORE_VALUE": return result(mine.some((press) => press.previous < value), isFinal, `PRESS BEFORE ${value}`);
    case "BUTTON_TARGET_BEFORE_VALUE": return result(targetPresses.some((press) => press.previous < value), isFinal, `TARGET BEFORE ${value}`);
    case "BUTTON_PASS_VALUE_WITHOUT_OWNER": return result(Boolean(history.find((press) => press.previous < value && press.current > value && press.actorPlayerId !== ownerPlayerId)), isFinal, `PASS ${value} WITHOUT YOU`);
    case "BUTTON_LAST_BEFORE_VALUE": return currentResult(crossedValue ? beforeValue === ownerPlayerId : last === ownerPlayerId, isFinal, beforeValue === ownerPlayerId ? `LAST BEFORE ${value}` : `NOT LAST BEFORE ${value}`);
    case "BUTTON_NOT_LAST_BEFORE_VALUE": return currentResult(crossedValue ? beforeValue !== ownerPlayerId : last !== ownerPlayerId, isFinal, beforeValue === ownerPlayerId ? `YOU WERE LAST BEFORE ${value}` : `SAFE BEFORE ${value}`);
    case "BUTTON_PRESS_BEFORE_AND_AFTER": return result(mine.some((press) => press.previous < value) && mine.some((press) => press.previous >= value), isFinal, `PRESS BEFORE + AFTER ${value}`);
    case "BUTTON_HIT_TWO_VALUES": return result(new Set(mine.filter((press) => press.current % 2 !== 0).map((press) => press.current)).size >= 2, isFinal, "TWO ODD LANDINGS");
    case "BUTTON_DISTINCT_PLAYERS": { const unique = new Set(history.map((press) => press.actorPlayerId)).size; return result(unique >= count, isFinal, `${unique} / ${count} PLAYERS`, unique, count); }
    case "BUTTON_EVERYONE_PRESSES": { const required = new Set(events.flatMap((event) => event.type === "SEQUENCE_CHANGED" ? event.playerIds : [])); const unique = new Set(history.map((press) => press.actorPlayerId)); const success = required.size > 0 && [...required].every((id) => unique.has(id)); return result(success, isFinal, `${unique.size} / ${required.size} PLAYERS`, unique.size, required.size || 1); }
    case "BUTTON_TARGET_REACHES_20": return result(history.some((press) => press.actorPlayerId === targetId && press.current === 20), isFinal, "TARGET MUST HIT 20");
    case "BUTTON_PREVENT_TARGET_20": { const failed = history.some((press) => press.actorPlayerId === targetId && press.current === 20); return failed ? result(false, isFinal, "TARGET HIT 20", null, null, true) : currentResult(true, isFinal, "TARGET HAS NOT HIT 20"); }
    case "BUTTON_FIRST_AND_FINAL": return currentResult(first === ownerPlayerId && last === ownerPlayerId, isFinal, "FIRST + FINAL PRESS");
    case "BUTTON_TARGET_AND_OWNER_PRESS": return result(mine.length > 0 && targetPresses.length > 0, isFinal, mine.length && targetPresses.length ? "BOTH PRESSED" : "WAITING FOR BOTH");
    default: return { status: isFinal ? "failed" : "still_possible", current: null, target: null, summary: isFinal ? "FAILED" : "STILL POSSIBLE" };
  }
}

export function createButtonEvaluatorRegistry() {
  const registry = new RuleEvaluatorRegistry();
  for (const template of BUTTON_RULE_TEMPLATES) {
    const id = `rule:${template.id.toLowerCase().replaceAll("_", "-")}`;
    registry.register({
      id, onGameEvent: () => {},
      evaluateProgress: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events),
      evaluateSuccess: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events).status === "completed",
      evaluateFailure: (context) => evaluateButtonRule(context.rule, context.ownerPlayerId, context.events).status === "failed",
    });
  }
  return registry;
}

export function evaluateButtonAssignments(assignments: ReadonlyMap<string, PrivatePlayerRoundState>, events: readonly ObservableGameEvent[]) {
  const registry = createButtonEvaluatorRegistry();
  return new Map([...assignments].map(([playerId, state]) => {
    if (state.secretRule.category === "hidden_ability") {
      const used = state.hiddenAbilities.every((ability) => ability.usesRemaining === 0);
      const ended = final(events);
      const privateProgress: Progress = used
        ? { status: "completed", current: 1, target: 1, summary: "ABILITY USED" }
        : { status: ended ? "failed" : "still_possible", current: 0, target: 1, summary: ended ? "ABILITY UNUSED" : "ABILITY READY" };
      return [playerId, { ...state, privateProgress }] as const;
    }
    const context: RuleEvaluationContext = { rule: state.secretRule, ownerPlayerId: playerId, events };
    const progress = registry.get(state.secretRule.evaluatorId)?.evaluateProgress(context) ?? state.privateProgress;
    return [playerId, { ...state, privateProgress: progress }] as const;
  }));
}
