"use client";

import { useEffect, useReducer, useRef } from "react";
import { useSound } from "../../preferences/provider.tsx";
import { GameButton, GameModal, SecretCard } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";
import { tutorialReducer, type TutorialStep } from "./interaction-state.ts";

const steps = [
  { title: "GET YOUR CARDS", text: "Everyone starts with 5 private cards.", visual: "5 PRIVATE CARDS" },
  { title: "GET YOUR SECRET", text: "Only you can see it. Completion stays hidden until reveal.", visual: "YOUR EYES ONLY" },
  { title: "PLAY A CARD", text: "Choose the real card privately and place it face-down.", visual: "REAL CARD · -2" },
  { title: "MAKE YOUR CLAIM", text: "Tell the truth or claim any other card identity.", visual: "I PLAYED +2" },
  { title: "TRUST OR CALL BLUFF", text: "Everyone else gets one short chance to challenge.", visual: "CALL BLUFF" },
  { title: "RESOLVE", text: "A caught bluff is cancelled. A truthful challenged card still resolves.", visual: "ACTUAL -2 · CLAIM +2" },
  { title: "HIT THE TARGET", text: "Move the Button to the exact number. Overshoots do nothing.", visual: "28 / 30" },
  { title: "REVEAL", text: "Secrets, points, and standings appear at round end.", visual: "SECRET +3" },
] as const;

function TutorialVisual({ step }: { step: TutorialStep }) {
  if (step === 0) return <div className="tutorial-card-fan" aria-label="Five private cards">{["+1", "SKIP", "-2", "WILD", "+3"].map((card) => <i key={card}>{card}</i>)}</div>;
  if (step === 1) return <SecretCard rule="BLUFF WITH A NEGATIVE CARD." ownerLabel="YOU / PUBLIC EXAMPLE" example />;
  if (step === 2 || step === 3) return <div className="tutorial-facedown"><i>{step === 2 ? "-2" : "?"}</i><strong>{steps[step].visual}</strong></div>;
  if (step === 4) return <div className="tutorial-bluff-button">CALL BLUFF</div>;
  if (step === 5) return <div className="tutorial-comparison"><span>ACTUAL <b>-2</b></span><span>CLAIM <b>+2</b></span><strong>BLUFF CAUGHT</strong></div>;
  if (step === 6) return <div className="tutorial-counter"><strong>28</strong><span>EXACT TARGET 30</span></div>;
  return <div className="tutorial-reward"><GameIcon name="secret" size={32} /><strong>SECRET COMPLETED</strong><span>+3 POINTS</span></div>;
}

export function HowToPlay({ onClose, onRoomAction }: { onClose: () => void; onRoomAction: (mode: "create" | "join") => void }) {
  const [step, dispatch] = useReducer(tutorialReducer, 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const sound = useSound();
  useEffect(() => { heading.current?.focus(); }, [step]);
  function move(action: "next" | "back") { sound.play("cardSlide"); dispatch(action); }
  return <GameModal open onClose={onClose} title="HOW TO PLAY" className="tutorial-modal tutorial-modal--v2"><div className="tutorial-progress"><p className="eyebrow" role="status">STEP 0{step + 1} / 08</p><ol aria-label="Tutorial progress">{steps.map((item, index) => <li key={item.title} aria-current={index === step ? "step" : undefined}><span className="sr-only">Step {index + 1}: {item.title}</span></li>)}</ol></div>
    <h3 ref={heading} tabIndex={-1} className="tutorial-title">0{step + 1} — {steps[step].title}</h3><p className="tutorial-v2-copy">{steps[step].text}</p><div className={`tutorial-stage tutorial-stage--${step}`} key={step}><TutorialVisual step={step} /></div><p className="tutorial-disclaimer"><GameIcon name="secret" size={13} /> All visuals are public examples. Real hands and Secrets go only to their owners.</p>
    <div className="tutorial-actions"><GameButton variant="ghost" size="small" disabled={step === 0} onClick={() => move("back")}><GameIcon className="icon-back" name="arrow" size={16} /> BACK</GameButton>{step < 7 ? <GameButton onClick={() => move("next")}>NEXT<GameIcon name="arrow" size={18} /></GameButton> : <div className="tutorial-room-actions"><GameButton size="small" onClick={() => onRoomAction("create")}>CREATE ROOM</GameButton><GameButton variant="secondary" size="small" onClick={() => onRoomAction("join")}>JOIN ROOM</GameButton></div>}</div>
  </GameModal>;
}
