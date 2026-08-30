// HOMEPAGE FICTION ONLY. This script never imports the realtime client, shared
// protocol, RoomState, or authoritative game engine.
export const demoFrames = {
  idle: { claim: null, actual: null, message: "PLAY THE EXAMPLE", next: null, delay: 0 },
  claim: { claim: "+2", actual: null, message: "YOU CLAIM +2", next: "challenge", delay: 1200 },
  challenge: { claim: "+2", actual: null, message: "LIV CALLS BLUFF", next: "flip", delay: 1250 },
  flip: { claim: "+2", actual: "-2", message: "ACTUAL CARD: -2", next: "caught", delay: 1100 },
  caught: { claim: "+2", actual: "-2", message: "BLUFF CAUGHT", next: "score", delay: 1250 },
  score: { claim: "+2", actual: "-2", message: "LIV +1 · YOU -1", next: "secret", delay: 1250 },
  secret: { claim: "+2", actual: "-2", message: "BUT WHY DID YOU BLUFF?", next: "complete", delay: 1500 },
  complete: { claim: "+2", actual: "-2", message: "EVERY MOVE HAS A MOTIVE.", next: null, delay: 0 },
} as const;
export type DemoStage = keyof typeof demoFrames;
export type DemoState = Readonly<{ stage: DemoStage; run: number }>;
export type DemoAction = { type: "press" } | { type: "reset" } | { type: "advance"; run: number; from: DemoStage };
export const initialDemo: DemoState = { stage: "idle", run: 0 };

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") return { stage: "idle", run: state.run + 1 };
  if (action.type === "press") return state.stage === "idle" ? { ...state, stage: "claim" } : state;
  if (action.run !== state.run || action.from !== state.stage) return state;
  const next = demoFrames[state.stage].next;
  return next ? { ...state, stage: next } : state;
}

export type DemoScheduler = { after: (callback: () => void, delay: number) => () => void };
export function scheduleDemoStep(state: DemoState, dispatch: (action: DemoAction) => void, scheduler: DemoScheduler): () => void {
  const frame = demoFrames[state.stage];
  return frame.next ? scheduler.after(() => dispatch({ type: "advance", from: state.stage, run: state.run }), frame.delay) : () => {};
}
