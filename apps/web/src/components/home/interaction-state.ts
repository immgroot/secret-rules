export type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export function tutorialReducer(step: TutorialStep, action: "next" | "back" | "reset"): TutorialStep {
  if (action === "reset") return 0;
  return Math.min(9, Math.max(0, step + (action === "next" ? 1 : -1))) as TutorialStep;
}

export type TutorialState = {
  step: TutorialStep;
  realCard: string | null;
  claim: string | null;
};

export type TutorialAction =
  | { type: "next" | "back" | "reset" }
  | { type: "selectReal"; card: string }
  | { type: "selectClaim"; card: string };

export const INITIAL_TUTORIAL_STATE: TutorialState = Object.freeze({ step: 0, realCard: null, claim: null });

/** The scripted choices are interaction requirements, not decorative copy. */
export function tutorialCanContinue(state: TutorialState) {
  if (state.step === 2) return state.realCard === "-2";
  if (state.step === 3) return state.claim === "+2";
  return true;
}

export function tutorialStateReducer(state: TutorialState, action: TutorialAction): TutorialState {
  if (action.type === "reset") return INITIAL_TUTORIAL_STATE;
  if (action.type === "selectReal") return { ...state, realCard: action.card };
  if (action.type === "selectClaim") return { ...state, claim: action.card };
  if (action.type === "next" && !tutorialCanContinue(state)) return state;
  return { ...state, step: tutorialReducer(state.step, action.type) };
}

export type ExampleCardId = "a" | "b" | "c";
export function inspectCard(current: ExampleCardId | null, next: ExampleCardId): ExampleCardId | null {
  return current === next ? null : next;
}

export function logoClickCount(count: number) { return Math.min(5, count + 1); }
