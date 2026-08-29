"use client";

import { useEffect, useReducer } from "react";
import { useSound } from "../../../preferences/provider.tsx";
import { GameIcon } from "../../icons/game-icon.tsx";
import { GameButton, GameCard, PlayerBadge, SecretCard } from "../../ui/index.ts";
import { demoFrames, demoReducer, initialDemo, scheduleDemoStep, type DemoScheduler } from "./script.ts";

const scheduler: DemoScheduler = {
  after(callback, delay) { const timeout = window.setTimeout(callback, delay); return () => window.clearTimeout(timeout); },
};

export function ButtonDemo() {
  const [state, dispatch] = useReducer(demoReducer, initialDemo);
  const sound = useSound();
  const frame = demoFrames[state.stage];
  const revealed = state.stage === "reveal" || state.stage === "complete";
  const unexpected = state.stage === "milo" || state.stage === "wait";

  useEffect(() => {
    if (state.stage === "you" || state.stage === "liv") { sound.play("buttonPress"); sound.play("counterTick"); }
    if (state.stage === "milo") { sound.play("buttonPress"); sound.play("unexpectedCounter"); }
    if (state.stage === "reveal") sound.play("secretReveal");
    return scheduleDemoStep(state, dispatch, scheduler);
  }, [state, sound]);

  return <GameCard className="button-preview local-demo" aria-label="The Button: isolated local demo" data-demo-stage={state.stage}>
    <div className="preview-toolbar"><span className="eyebrow">LOCAL DEMO</span><span className="demo-duration"><GameIcon name="timer" size={14} /> 11 SEC · SIMULATED PLAYERS</span></div>
    <div className="preview-objective"><p>THE PUBLIC CHALLENGE</p><h3>GET THE COUNTER TO EXACTLY <span>20</span></h3></div>
    <div className="button-table">
      <div className="table-orbit" aria-hidden="true" />
      <div className="preview-player preview-player--one"><PlayerBadge name="YOU" tone="lime" compact reaction={frame.actor === "you" ? "press" : unexpected ? "surprised" : "idle"} /><span className="speech-bubble">{unexpected ? "Wait. What?" : "Let’s think about this."}</span></div>
      <div className="preview-player preview-player--two"><PlayerBadge name="LIV" tone="violet" compact reaction={frame.actor === "liv" ? "press" : revealed ? "suspicious" : "idle"} /><span className="speech-bubble">Just press it.</span></div>
      <div className="preview-player preview-player--three"><PlayerBadge name="MILO" tone="coral" compact reaction={frame.actor === "milo" ? "press" : revealed ? "suspicious" : "idle"} /></div>
      <div className="preview-player preview-player--four"><PlayerBadge name="JUNE" tone="blue" compact reaction={unexpected ? "surprised" : "idle"} /></div>
      <div className="counter-display" aria-label={`Demo counter: ${frame.counter}`}><span>COUNTER</span><strong key={`${state.run}-${frame.counter}`}>{frame.counter}</strong></div>
      <button type="button" className="physical-button" aria-label="Press the demo button" aria-disabled={state.stage !== "idle"} aria-describedby="demo-narration"
        onClick={() => { if (state.stage === "idle") { sound.unlock(); dispatch({ type: "press" }); } }}>
        <span key={`${state.run}-${frame.actor}`} className={`physical-button__base ${frame.actor ? "physical-button__base--pressed" : ""}`}><span className="physical-button__top"><span /></span></span>
      </button>
    </div>
    <div className="demo-story" id="demo-narration" role="status" aria-live="polite" aria-atomic="true">
      {revealed ? <>
        <SecretCard className="demo-secret" rule="YOUR PRESSES COUNT TWICE." ownerLabel="MILO’S SECRET RULE" tone="green" example />
        <p className="demo-punchline">{state.stage === "complete" ? frame.message : "ONE PRESS. TWO ON THE COUNTER."}</p>
      </> : <div className="demo-beat" key={state.stage}><p className="eyebrow">{state.stage === "idle" ? "YOUR TURN" : "A PERFECTLY NORMAL BUTTON…"}</p><p className={state.stage === "wait" ? "demo-question" : "demo-status"}>{frame.message}</p><span>{state.stage === "idle" ? "One press starts a short, scripted demonstration." : "These are simulated players, not people online."}</span></div>}
    </div>
    <div className="demo-footer"><span><GameIcon name="rule" size={13} /> No room. No connection. Just a little chaos.</span><GameButton variant="ghost" size="small" onClick={() => { sound.stop(); dispatch({ type: "reset" }); }}><GameIcon name="reconnect" size={14} /> RESET DEMO</GameButton></div>
  </GameCard>;
}
