// HOMEPAGE FICTION ONLY. Not a game engine, network contract, or RoomState.
// Real mini-games must be implemented later on the authoritative Node server.
export const demoFrames = {
  idle: { counter: 12, actor: null, message: "Go on. Press it.", next: null, delay: 0 },
  you: { counter: 13, actor: "you", message: "You pressed. Counter: 13.", next: "liv", delay: 1800 },
  liv: { counter: 14, actor: "liv", message: "Liv pressed. Counter: 14.", next: "milo", delay: 2000 },
  milo: { counter: 16, actor: "milo", message: "Milo pressed. Counter: 16. Hang on…", next: "wait", delay: 1800 },
  wait: { counter: 16, actor: null, message: "WAIT. WHY DID THAT GO UP BY 2?", next: "reveal", delay: 2600 },
  reveal: { counter: 16, actor: null, message: "Milo’s secret rule: your presses count twice.", next: "complete", delay: 2800 },
  complete: { counter: 16, actor: null, message: "NOW IMAGINE NOBODY TOLD YOU THAT.", next: null, delay: 0 },
} as const;
export type DemoStage = keyof typeof demoFrames;
export type DemoState = Readonly<{ stage: DemoStage; run: number }>;
export type DemoAction = { type: "press" } | { type: "reset" } | { type: "advance"; run: number; from: DemoStage };
export const initialDemo: DemoState = { stage: "idle", run: 0 };

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") return { stage: "idle", run: state.run + 1 };
  if (action.type === "press") return state.stage === "idle" ? { ...state, stage: "you" } : state;
  if (action.run !== state.run || action.from !== state.stage) return state;
  const next = demoFrames[state.stage].next;
  return next ? { ...state, stage: next } : state;
}

export type DemoScheduler = { after: (callback: () => void, delay: number) => () => void };
export function scheduleDemoStep(state: DemoState, dispatch: (action: DemoAction) => void, scheduler: DemoScheduler): () => void {
  const frame = demoFrames[state.stage];
  if (!frame.next) return () => {};
  return scheduler.after(() => dispatch({ type: "advance", from: state.stage, run: state.run }), frame.delay);
}
