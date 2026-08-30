export type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export function tutorialReducer(step: TutorialStep, action: "next" | "back" | "reset"): TutorialStep {
  if (action === "reset") return 0;
  return Math.min(9, Math.max(0, step + (action === "next" ? 1 : -1))) as TutorialStep;
}

export type ExampleCardId = "a" | "b" | "c";
export function inspectCard(current: ExampleCardId | null, next: ExampleCardId): ExampleCardId | null {
  return current === next ? null : next;
}

export function logoClickCount(count: number) { return Math.min(5, count + 1); }
