import type { ButtonCardKind } from "@secret-rules/shared";
import { BUTTON_CARD_MOVEMENT } from "@secret-rules/shared";

export const BUTTON_COUNTDOWN_MS = 3_000;
export const BUTTON_CHALLENGE_REVEAL_MS = 1_100;

export type MovementResolution = {
  previous: number;
  attempted: number;
  current: number;
  applied: number;
  overshot: boolean;
  secured: boolean;
};

export function movementForCard(kind: ButtonCardKind) {
  return BUTTON_CARD_MOVEMENT[kind] ?? (kind === "WILD" ? null : 1);
}

export function applyButtonMovement(counter: number, target: number, movement: number, targetAlreadySecured: boolean): MovementResolution {
  if (targetAlreadySecured) return { previous: counter, attempted: counter + movement, current: counter, applied: 0, overshot: false, secured: false };
  const attempted = counter + movement;
  if (attempted > target) return { previous: counter, attempted, current: counter, applied: 0, overshot: true, secured: false };
  const current = Math.max(0, attempted);
  return { previous: counter, attempted, current, applied: current - counter, overshot: false, secured: current === target };
}

export function basicButtonAvailable(handSize: number) {
  return handSize === 0;
}
