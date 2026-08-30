import type { PrivatePlayerRoundState, PublicButtonEffect, PublicRoundEvent, PublicRoundState } from "@secret-rules/shared";

export type PrivateEffectPresentation =
  | { kind: "inspect"; id: string; playerId: string; card: PrivatePlayerRoundState["inspections"][number]["card"] }
  | { kind: "steal"; id: string; playerId: string; card: PrivatePlayerRoundState["cardTransfers"][number]["card"] };

/** Selects only recipient-authorized knowledge already present in private state. */
export function latestPrivateEffect(state: Pick<PrivatePlayerRoundState, "inspections" | "cardTransfers">): PrivateEffectPresentation | null {
  const latestInspection = state.inspections.at(-1);
  const latestTransfer = state.cardTransfers.at(-1);
  if (latestInspection && (!latestTransfer || latestInspection.inspectedAt >= latestTransfer.receivedAt)) {
    return { kind: "inspect", id: latestInspection.knowledgeId, playerId: latestInspection.targetPlayerId, card: latestInspection.card };
  }
  return latestTransfer
    ? { kind: "steal", id: latestTransfer.knowledgeId, playerId: latestTransfer.sourcePlayerId, card: latestTransfer.card }
    : null;
}

export function privateEffectIsVisible(effect: PrivateEffectPresentation | null, dismissedId: string | null): effect is PrivateEffectPresentation {
  return effect !== null && effect.id !== dismissedId;
}

export function publicEffectLabel(type: PublicButtonEffect["type"]) {
  switch (type) {
    case "inspect": return "INSPECTION COMPLETE";
    case "steal": return "A CARD WAS STOLEN";
    case "skip": return "SKIP ARMED";
    case "reverse": return "DIRECTION REVERSED";
    case "shield": return "SHIELD ARMED";
    case "shield_blocked": return "SHIELD BLOCKED IT";
    default: return "BUTTON MOVED";
  }
}

export function currentTurnKey(round: PublicRoundState): string | null {
  if (round.phase !== "turn_action" || !round.publicGameState.currentPlayerId || round.publicTimer?.kind !== "turn") return null;
  return `${round.roundId}:${round.publicGameState.currentPlayerId}:${round.publicTimer.deadlineAt}`;
}

export function shouldNotifyLocalTurn(previousKey: string | null, nextKey: string | null, currentPlayerId: string | null, localPlayerId: string | null) {
  return Boolean(nextKey && nextKey !== previousKey && currentPlayerId && currentPlayerId === localPlayerId);
}

export function eventsAfter(events: readonly PublicRoundEvent[], lastEventId: string | null): readonly PublicRoundEvent[] {
  if (!lastEventId) return [];
  const index = events.findIndex((event) => event.eventId === lastEventId);
  return index < 0 ? [] : events.slice(index + 1);
}

export function remainingSeconds(round: PublicRoundState, now: number): number | null {
  if (!round.publicTimer) return null;
  return Math.max(0, Math.ceil((round.publicTimer.deadlineAt - now) / 1_000));
}
