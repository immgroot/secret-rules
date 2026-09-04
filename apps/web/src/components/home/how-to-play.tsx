"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { useSound } from "../../preferences/provider.tsx";
import { GameButton, GameModal, SecretCard } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";
import { INITIAL_TUTORIAL_STATE, tutorialCanContinue, tutorialStateReducer, type TutorialStep } from "./interaction-state.ts";

export const tutorialSteps = [
  { title: "GET YOUR CARDS", text: "Everyone starts with five private cards. The other players never receive your hand." },
  { title: "GET YOUR SECRET", text: "Your private objective changes how you play. Progress stays hidden until the round reveal." },
  { title: "PLAY A NUMBER CARD", text: "Choose a Number Card. It goes face-down, so only the server and you know its real value." },
  { title: "CLAIM A NUMBER", text: "Publicly claim +1, +2, +3, -1, or -2. Effect Cards are never claim choices." },
  { title: "TRUST OR CALL BLUFF", text: "The first opponent to challenge gets the call. If nobody challenges before time runs out, the table trusts you." },
  { title: "CHALLENGE RESULT", text: "A caught bluff is cancelled. A truthful card still resolves when someone accuses you." },
  { title: "PLAY EFFECTS DIRECTLY", text: "Effect Cards are face-up direct actions. They cannot be claimed, bluffed, or challenged." },
  { title: "HIT THE TARGET", text: "Reach the exact target to secure it. An overshoot leaves the Button where it was." },
  { title: "END OR CONTINUE", text: "Players vote privately after the target. One Last Chance can happen before the round ends." },
  { title: "REVEAL YOUR SECRET", text: "Completed Secrets earn bonus points, then the round standings appear. Highest match score wins." },
] as const;

const hand = ["+1", "SKIP", "-2", "WILD", "+3"] as const;
const claims = ["+1", "+2", "+3", "-1", "-2"] as const;
const effects = ["INSPECT", "STEAL", "SKIP", "REVERSE", "SHIELD", "WILD"] as const;

function TutorialTable({ children }: { children: ReactNode }) {
  return <div className="tutorial-pov" aria-label="Example table from your point of view">
    <div className="tutorial-pov__seats">
      <span className="tutorial-pov__player tutorial-pov__player--top">ALEX</span>
      <span className="tutorial-pov__player tutorial-pov__player--left">SAM</span>
      <span className="tutorial-pov__player tutorial-pov__player--right">NIDA</span>
      <span className="tutorial-pov__player tutorial-pov__player--you">YOU · FRONT</span>
    </div>
    <div className="tutorial-pov__center" data-layer="tutorial-foreground">{children}</div>
  </div>;
}

function TutorialVisual({ step, realCard, claim, chooseReal, chooseClaim }: {
  step: TutorialStep;
  realCard: string | null;
  claim: string | null;
  chooseReal: (card: string) => void;
  chooseClaim: (card: string) => void;
}) {
  if (step === 0) return <TutorialTable><div className="tutorial-card-fan" aria-label="Your five private cards">{hand.map((card) => <i key={card}>{card}</i>)}</div><strong className="tutorial-cue">PRIVATE HAND · ONLY YOU SEE THIS</strong></TutorialTable>;
  if (step === 1) return <TutorialTable><SecretCard rule="SUCCESSFULLY BLUFF 3 TIMES." ownerLabel="YOU / PUBLIC EXAMPLE" example /><strong className="tutorial-cue">PRIVATE SECRET · +3 OR +5</strong></TutorialTable>;
  if (step === 2) return <TutorialTable><div className="tutorial-choice"><strong>CHOOSE YOUR REAL CARD</strong><div>{hand.map((card) => <button type="button" key={card} aria-pressed={realCard === card} onClick={() => chooseReal(card)}>{card}</button>)}</div><small>{realCard === "-2" ? "-2 SELECTED · READY" : "SELECT -2 TO CONTINUE"}</small></div></TutorialTable>;
  if (step === 3) return <TutorialTable><div className="tutorial-claim-builder"><div className="tutorial-facedown"><i>?</i><strong>REAL CARD · {realCard ?? "-2"}</strong></div><div className="tutorial-choice tutorial-choice--claims"><strong>MAKE A PUBLIC CLAIM</strong><div>{claims.map((card) => <button type="button" key={card} aria-pressed={claim === card} onClick={() => chooseClaim(card)}>{card}</button>)}</div><small>{claim === "+2" ? "+2 CLAIMED · THAT IS A BLUFF" : "CLAIM +2 TO CONTINUE"}</small></div></div></TutorialTable>;
  if (step === 4) return <TutorialTable><div className="tutorial-facedown tutorial-facedown--challenge"><i>?</i><strong>YOU CLAIM +2</strong></div><div className="tutorial-bluff-button">NIDA CALLS BLUFF</div><p className="tutorial-timer"><GameIcon name="timer" size={14} /> FIRST CHALLENGER WINS · SILENCE MEANS TRUST</p></TutorialTable>;
  if (step === 5) return <TutorialTable><div className="tutorial-comparison"><span>ACTUAL <b>-2</b></span><span>CLAIM <b>+2</b></span><strong>BLUFF CAUGHT</strong><small>NIDA +1 · YOU -1 · EXTRA CARD DISCARDED</small></div><p className="tutorial-fine-print">If the card had been truthful: accuser -1, player +1, and the card would resolve. Scores never fall below 0.</p></TutorialTable>;
  if (step === 6) return <TutorialTable><div className="tutorial-effect-lesson"><div className="tutorial-effect-flow"><span><b>INSPECT</b><small>FACE-UP</small></span><i aria-hidden="true">→</i><span><b>NIDA</b><small>ACTUAL TARGET</small></span></div><div className="tutorial-effect-private"><span>PRIVATE RESULT · ONLY YOU SEE THIS</span><strong>NIDA HAS SHIELD</strong><small>THE CARD STAYS IN NIDA’S HAND.</small></div><div className="tutorial-effect-chips" aria-label="Direct Effect Cards">{effects.map((effect) => <b key={effect}>{effect}</b>)}</div><p>EFFECT CARDS ACT DIRECTLY · NO CLAIM · NO CALL BLUFF</p><small>INSPECT, STEAL, SKIP, REVERSE, and SHIELD also move the Button +1. WILD uses only your chosen movement.</small></div></TutorialTable>;
  if (step === 7) return <TutorialTable><div className="tutorial-target"><div className="tutorial-counter"><strong>28</strong><span>TARGET 30</span></div><span className="tutorial-target__move">PLAY +2 → <b>30</b> · SECURED</span><span className="tutorial-target__overshoot">PLAY +3 → 31 · STAYS AT 28</span></div></TutorialTable>;
  if (step === 8) return <TutorialTable><div className="tutorial-vote"><strong>TARGET SECURED</strong><p>PRIVATE VOTE</p><div><span>END ROUND</span><span>CONTINUE PLAYING</span></div><small>If the vote continues, the table gets exactly one Last Chance Rotation.</small><em>YOUR SECRET PROGRESS · 3 / 3 · STILL PRIVATE</em></div></TutorialTable>;
  return <TutorialTable><div className="tutorial-final"><SecretCard rule="SUCCESSFULLY BLUFF 3 TIMES." ownerLabel="YOU / REVEALED" tone="green" example /><div className="tutorial-reward"><GameIcon name="secret" size={26} /><strong>SECRET COMPLETED</strong><span>STANDARD +3</span><em>HARD SECRET +5</em><small>YOU 7 · NIDA 5 · ALEX 3 · SAM 2</small></div></div></TutorialTable>;
}

export function HowToPlay({ onClose, onRoomAction }: { onClose: () => void; onRoomAction: (mode: "create" | "join") => void }) {
  const [tutorial, dispatch] = useReducer(tutorialStateReducer, INITIAL_TUTORIAL_STATE);
  const { step, realCard, claim } = tutorial;
  const heading = useRef<HTMLHeadingElement>(null);
  const sound = useSound();
  const canContinue = tutorialCanContinue(tutorial);
  useEffect(() => { heading.current?.focus(); }, [step]);
  function move(action: "next" | "back") { sound.play("cardSlide"); dispatch({ type: action }); }
  function restart() { sound.play("cardSlide"); dispatch({ type: "reset" }); }
  return <GameModal open onClose={onClose} title="HOW TO PLAY" className="tutorial-modal tutorial-modal--v2">
    <div className="tutorial-progress"><p className="eyebrow" role="status">STEP {String(step + 1).padStart(2, "0")} / 10</p><ol aria-label="Tutorial progress">{tutorialSteps.map((item, index) => <li key={item.title} aria-current={index === step ? "step" : undefined}><span className="sr-only">Step {index + 1}: {item.title}</span></li>)}</ol></div>
    <h3 ref={heading} tabIndex={-1} className="tutorial-title">{String(step + 1).padStart(2, "0")} — {tutorialSteps[step].title}</h3>
    <p className="tutorial-v2-copy">{tutorialSteps[step].text}</p>
    <div className={`tutorial-stage tutorial-stage--${step}`} key={step}><TutorialVisual step={step} realCard={realCard} claim={claim} chooseReal={(card) => { sound.play("cardSlide"); dispatch({ type: "selectReal", card }); }} chooseClaim={(card) => { sound.play("uiClick"); dispatch({ type: "selectClaim", card }); }} /></div>
    <p className="tutorial-disclaimer"><GameIcon name="secret" size={13} /> Guided public example. Real hands, choices, progress, and Secrets go only to their authorized player.</p>
    <div className="tutorial-secondary-actions"><GameButton variant="ghost" size="small" onClick={restart}><GameIcon name="reconnect" size={14} /> RESTART</GameButton><GameButton variant="ghost" size="small" onClick={onClose}>SKIP TUTORIAL</GameButton></div>
    <div className="tutorial-actions"><GameButton variant="ghost" size="small" disabled={step === 0} onClick={() => move("back")}><GameIcon className="icon-back" name="arrow" size={16} /> BACK</GameButton>{step < 9 ? <GameButton disabled={!canContinue} onClick={() => move("next")}>NEXT<GameIcon name="arrow" size={18} /></GameButton> : <div className="tutorial-room-actions"><GameButton size="small" onClick={() => onRoomAction("create")}>CREATE ROOM</GameButton><GameButton variant="secondary" size="small" onClick={() => onRoomAction("join")}>JOIN ROOM</GameButton></div>}</div>
  </GameModal>;
}
