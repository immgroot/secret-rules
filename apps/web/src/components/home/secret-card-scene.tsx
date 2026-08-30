"use client";

import { useState, type PointerEvent } from "react";
import { GameIcon } from "../icons/game-icon.tsx";
import { SecretCard } from "../ui/secret-card.tsx";
import { usePreferences } from "../../preferences/provider.tsx";
import { inspectCard, type ExampleCardId } from "./interaction-state.ts";

const examples = [
  { id: "a", ownerLabel: "PLAYER 01 / YOU", tone: "paper", rule: "SUCCESSFULLY\nBLUFF 3 TIMES." },
  { id: "b", ownerLabel: "PLAYER 02 / LIV", tone: "violet", rule: "CORRECTLY CATCH\n2 BLUFFS." },
  { id: "c", ownerLabel: "PLAYER 03 / MILO", tone: "green", rule: "MAKE 3 TRUTHFUL\nCLAIMS." },
] as const;

export function SecretCardScene() {
  const [focused, setFocused] = useState<ExampleCardId | null>(null);
  const { reducedMotion } = usePreferences();
  function tilt(event: PointerEvent<HTMLElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    event.currentTarget.style.setProperty("--card-x", `${-y * 1.5}deg`);
    event.currentTarget.style.setProperty("--card-y", `${x * 2}deg`);
  }
  function resetTilt(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--card-x", "0deg");
    event.currentTarget.style.setProperty("--card-y", "0deg");
  }
  return <div className="hero-art">
    <div className="hero-art__orbit" aria-hidden="true" />
    <span className="art-cross art-cross--one" aria-hidden="true">+</span>
    <span className="art-cross art-cross--two" aria-hidden="true">+</span>
    <p className="scene-label"><span /> THREE FRIENDS. THREE AGENDAS.</p>
    <div className="card-stack">
      {examples.map(({ id, ...card }) => <SecretCard key={id} {...card} className={`hero-card hero-card--${id}`} example
        inspected={focused === id} onInspect={() => setFocused((current) => inspectCard(current, id))}
        onPointerMove={tilt} onPointerLeave={resetTilt} />)}
    </div>
    <div className="scene-note"><svg viewBox="0 0 72 45" aria-hidden="true"><path d="M2 37C26 43 51 29 54 6m-13 9L54 5l8 15" /></svg><span>And nobody knows<br />what you know.</span></div>
    <p className="scene-disclaimer"><GameIcon name="secret" size={13} /> Public examples. Real rules stay private.</p>
  </div>;
}
