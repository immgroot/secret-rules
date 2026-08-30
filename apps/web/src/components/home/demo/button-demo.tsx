"use client";

import { useEffect, useReducer } from "react";
import { useSound } from "../../../preferences/provider.tsx";
import { GameIcon } from "../../icons/game-icon.tsx";
import { GameButton, GameCard, PlayerBadge, SecretCard } from "../../ui/index.ts";
import { demoFrames, demoReducer, initialDemo, scheduleDemoStep, type DemoScheduler } from "./script.ts";

const scheduler: DemoScheduler = { after(callback, delay) { const timeout = window.setTimeout(callback, delay); return () => window.clearTimeout(timeout); } };

export function ButtonDemo() {
  const [state, dispatch] = useReducer(demoReducer, initialDemo);
  const sound = useSound();
  const frame = demoFrames[state.stage];
  const flipped = frame.actual !== null;
  const challenged = !["idle", "claim"].includes(state.stage);
  const revealSecret = state.stage === "secret" || state.stage === "complete";
  useEffect(() => {
    if (state.stage === "claim") sound.play("cardPlay");
    if (state.stage === "challenge") sound.play("callBluff");
    if (state.stage === "flip") sound.play("cardFlip");
    if (state.stage === "caught") sound.play("bluffCaught");
    if (state.stage === "score") { sound.play("pointGain"); sound.play("pointLoss"); }
    if (state.stage === "secret") sound.play("secretReveal");
    return scheduleDemoStep(state, dispatch, scheduler);
  }, [state, sound]);
  return <GameCard className="button-preview local-demo local-demo--v2" aria-label="The Button V2 interactive gameplay preview" data-demo-stage={state.stage}>
    <div className="preview-toolbar"><span className="eyebrow">INTERACTIVE PREVIEW</span><span className="demo-duration"><GameIcon name="timer" size={14} /> 8 SEC · SCRIPTED</span></div>
    <div className="preview-objective"><p>BUTTON V2</p><h3>PLAY HIDDEN. <span>CLAIM ANYTHING.</span></h3></div>
    <div className="v2-demo-table">
      <span className="v2-demo-player v2-demo-player--you"><PlayerBadge name="YOU" tone="lime" compact reaction={state.stage === "claim" ? "press" : "idle"} /></span>
      <span className="v2-demo-player v2-demo-player--liv"><PlayerBadge name="LIV" tone="violet" compact reaction={state.stage === "challenge" ? "suspicious" : "idle"} /></span>
      <div className="v2-demo-card" data-flipped={flipped}><span>{flipped ? frame.actual : "?"}</span></div>
      {frame.claim && <p className="v2-demo-claim"><b>YOU CLAIM</b> {frame.claim}</p>}
      {challenged && <span className="v2-demo-bluff">CALL BLUFF</span>}
      <div className="v2-demo-score"><span>LIV <b>{["score", "secret", "complete"].includes(state.stage) ? "+1" : "0"}</b></span><span>YOU <b>{["score", "secret", "complete"].includes(state.stage) ? "-1" : "0"}</b></span></div>
    </div>
    <div className="demo-story" role="status" aria-live="polite" aria-atomic="true">{revealSecret ? <><SecretCard className="demo-secret" rule="BLUFF WITH A NEGATIVE CARD." ownerLabel="YOUR SECRET · PUBLIC EXAMPLE" tone="green" example /><p className="demo-punchline">{frame.message}</p></> : <div className="demo-beat"><p className="eyebrow">{state.stage === "idle" ? "FACE-DOWN CARD READY" : "THE TABLE IS WATCHING"}</p><p className="demo-status">{frame.message}</p><span>{state.stage === "idle" ? "Start a short scripted example." : "No real room or player data is used."}</span></div>}</div>
    <div className="demo-footer"><span><GameIcon name="rule" size={13} /> Public example · real rooms stay synchronized</span>{state.stage === "idle" ? <GameButton size="small" onClick={() => { sound.unlock(); dispatch({ type: "press" }); }}>PLAY PREVIEW</GameButton> : <GameButton variant="ghost" size="small" onClick={() => { sound.stop(); dispatch({ type: "reset" }); }}><GameIcon name="reconnect" size={14} /> RESET</GameButton>}</div>
  </GameCard>;
}
