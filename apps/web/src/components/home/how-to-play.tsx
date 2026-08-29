"use client";

import { useEffect, useReducer, useRef } from "react";
import { useSound } from "../../preferences/provider.tsx";
import { GameButton, GameModal, SecretCard } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";
import { tutorialReducer } from "./interaction-state.ts";

const titles = [
  "EVERYONE GETS THE SAME CHALLENGE.",
  "BUT YOUR RULE IS YOURS ALONE.",
  "YOUR FRIEND HAS A DIFFERENT RULE.",
  "NOW TALK YOUR WAY OUT OF THAT.",
] as const;

export function HowToPlay({ onClose, onRoomAction }: { onClose: () => void; onRoomAction: (mode: "create" | "join") => void }) {
  const [step, dispatch] = useReducer(tutorialReducer, 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const sound = useSound();
  useEffect(() => { heading.current?.focus(); }, [step]);
  function move(action: "next" | "back") { sound.play("cardSlide"); dispatch(action); }

  return <GameModal open onClose={onClose} title="HOW TO PLAY" className="tutorial-modal">
    <div className="tutorial-progress"><p className="eyebrow" role="status">STEP 0{step + 1} / 04</p><ol aria-label="Tutorial progress">{titles.map((title, index) => <li key={title} aria-current={index === step ? "step" : undefined}><span className="sr-only">Step {index + 1}: {title}</span></li>)}</ol></div>
    <h3 ref={heading} tabIndex={-1} className="tutorial-title">{titles[step]}</h3>
    <div className={`tutorial-stage tutorial-stage--${step}`} key={step}>
      {step === 0 && <div className="tutorial-challenge"><GameIcon name="players" size={32} /><p className="eyebrow">THE PUBLIC CHALLENGE</p><p>GET THE COUNTER<br />TO EXACTLY <strong>20.</strong></p><span>One shared problem. Everyone sees this.</span></div>}
      {step === 1 && <><SecretCard rule={"DON’T LET IT\nHIT 13."} ownerLabel="YOU / PUBLIC EXAMPLE" example interactive /><p className="tutorial-caption">Your instructions arrive just for you.<br />What you tell everyone else is your business.</p></>}
      {step === 2 && <><SecretCard rule={"MAKE IT HIT\nEXACTLY 13."} ownerLabel="LIV / PUBLIC EXAMPLE" tone="violet" initiallyRevealed={false} interactive example /><p className="tutorial-caption">Reveal Liv’s example card.<br />See the problem yet?</p></>}
      {step === 3 && <><div className="tutorial-conflict"><SecretCard rule={"DON’T LET IT\nHIT 13."} ownerLabel="YOU / EXAMPLE" example /><span className="conflict-versus" aria-hidden="true">VS.</span><SecretCard rule={"MAKE IT HIT\nEXACTLY 13."} ownerLabel="LIV / EXAMPLE" tone="violet" example /></div><p className="tutorial-punchline">SAME GAME. <span>DIFFERENT RULES.</span></p></>}
    </div>
    <p className="tutorial-disclaimer"><GameIcon name="secret" size={13} /> Public examples. Actual rules are only sent to their owner.</p>
    <div className="tutorial-actions"><GameButton variant="ghost" size="small" disabled={step === 0} onClick={() => move("back")}><GameIcon className="icon-back" name="arrow" size={16} /> BACK</GameButton>{step < 3 ? <GameButton onClick={() => move("next")}>NEXT<GameIcon name="arrow" size={18} /></GameButton> : <div className="tutorial-room-actions"><GameButton size="small" onClick={() => onRoomAction("create")}>CREATE ROOM</GameButton><GameButton variant="secondary" size="small" onClick={() => onRoomAction("join")}>JOIN ROOM</GameButton></div>}</div>
  </GameModal>;
}
