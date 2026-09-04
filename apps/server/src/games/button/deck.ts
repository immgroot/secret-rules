import type { ButtonCard, ButtonCardKind } from "@secret-rules/shared";
import { BUTTON_CARD_KINDS } from "@secret-rules/shared";
import { deterministicUuid, seededRandom } from "../../rules/rng.ts";

export const STANDARD_BUTTON_DECK_COUNTS: Readonly<Record<ButtonCardKind, number>> = Object.freeze({
  PLUS_ONE: 12, PLUS_TWO: 10, PLUS_THREE: 7, MINUS_ONE: 6, MINUS_TWO: 5,
  INSPECT: 2, STEAL: 2, SKIP: 2, REVERSE: 2, SHIELD: 1, WILD: 1,
});

export function scaledButtonDeckCounts(size: number): Readonly<Record<ButtonCardKind, number>> {
  if (!Number.isInteger(size) || size < 30 || size > 200) throw new Error("Button deck size must be a whole number from 30 through 200.");
  const scale = size / 50;
  const counts = Object.fromEntries(BUTTON_CARD_KINDS.map((kind) => [kind, Math.floor(STANDARD_BUTTON_DECK_COUNTS[kind] * scale)])) as Record<ButtonCardKind, number>;
  let remaining = size - Object.values(counts).reduce((sum, count) => sum + count, 0);
  const priority = [...BUTTON_CARD_KINDS].sort((left, right) => {
    const leftRemainder = STANDARD_BUTTON_DECK_COUNTS[left] * scale - counts[left];
    const rightRemainder = STANDARD_BUTTON_DECK_COUNTS[right] * scale - counts[right];
    return rightRemainder - leftRemainder || BUTTON_CARD_KINDS.indexOf(left) - BUTTON_CARD_KINDS.indexOf(right);
  });
  for (let index = 0; remaining > 0; index++, remaining--) counts[priority[index % priority.length]!]++;
  return Object.freeze(counts);
}

export function buildButtonDeck(size: number, seed: string): ButtonCard[] {
  const counts = scaledButtonDeckCounts(size);
  const cards: ButtonCard[] = [];
  for (const kind of BUTTON_CARD_KINDS) {
    for (let index = 0; index < counts[kind]; index++) cards.push({ cardId: deterministicUuid(`${seed}:card:${kind}:${index}`), kind });
  }
  return seededRandom(`${seed}:shuffle`).shuffle(cards);
}

export function buttonDeckKindCounts(cards: readonly ButtonCard[]) {
  return Object.freeze(Object.fromEntries(BUTTON_CARD_KINDS.map((kind) => [kind, cards.filter((card) => card.kind === kind).length])) as Record<ButtonCardKind, number>);
}
