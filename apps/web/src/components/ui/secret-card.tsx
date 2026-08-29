"use client";

import { useId, useState, type HTMLAttributes } from "react";
import { GameIcon } from "../icons/game-icon.tsx";
import { LogoMark } from "../brand/logo.tsx";
import { useSound } from "../../preferences/provider.tsx";

type SecretCardProps = {
  rule: string;
  ownerLabel: string;
  tone?: "paper" | "violet" | "green";
  interactive?: boolean;
  initiallyRevealed?: boolean;
  className?: string;
  example?: boolean;
  kind?: "rule" | "information" | "ability";
  variant?: "standard" | "deal";
  onRevealChange?: (revealed: boolean) => void;
  onInspect?: () => void;
  inspected?: boolean;
  onPointerMove?: HTMLAttributes<HTMLElement>["onPointerMove"];
  onPointerLeave?: HTMLAttributes<HTMLElement>["onPointerLeave"];
};

/** Receives only an already-authorized rule. Conceal/reveal is NOT an authorization boundary. */
export function SecretCard({ rule, ownerLabel, tone = "paper", interactive = false, initiallyRevealed = true, className = "", example = false, kind = "rule", variant = "standard", onRevealChange, onInspect, inspected = false, onPointerMove, onPointerLeave }: SecretCardProps) {
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const sound = useSound();
  const contentId = useId();
  const labels = kind === "information" ? { title: "PRIVATE INFORMATION", overline: "ONLY YOU KNOW THIS", whisper: "What you do with it is up to you.", code: "PI.", button: "INFO" } : kind === "ability" ? { title: "SECRET ABILITY", overline: "ONE PRIVATE ADVANTAGE", whisper: "Keep this to yourself.", code: "SA.", button: "ABILITY" } : { title: "SECRET RULE", overline: "FOR YOUR EYES ONLY", whisper: "Keep this to yourself.", code: "SR.", button: "RULE" };
  return <article className={`secret-card secret-card--${tone} secret-card--${kind} secret-card--${variant} ${className}`} data-inspected={inspected} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} aria-label={`${example ? "Example secret" : labels.title} card for ${ownerLabel}`}>
    <header className="secret-card__header"><GameIcon name="secret" size={20} /><span>{labels.title}</span><span className="secret-card__number" aria-hidden="true">{labels.code}</span></header>
    <div id={contentId} className="secret-card__body" aria-live={interactive ? "polite" : "off"}>
      {revealed ? <div key="front" className="secret-card__face">{variant === "standard" && <p className="secret-card__overline">{labels.overline}</p>}<p className="secret-card__rule">{rule}</p><p className="secret-card__whisper">{variant === "deal" ? "Don’t let them know why." : labels.whisper}</p></div> : <div key="back" className="secret-card__face secret-card__cover"><LogoMark /><p>A LITTLE<br />SECRET.</p><span>Big consequences.</span></div>}
    </div>
    <footer className="secret-card__footer"><span>{ownerLabel}</span>{onInspect ? <span className="secret-card__inspect-label">{inspected ? "IN FOCUS" : "INSPECT"}<GameIcon name="secret" size={14} /></span> : interactive && (!revealed || variant === "standard") ? <button type="button" aria-expanded={revealed} aria-controls={contentId} onClick={() => { const next = !revealed; sound.play("cardFlip"); setRevealed(next); onRevealChange?.(next); }}>{revealed ? "HIDE" : "REVEAL"} {example ? "EXAMPLE" : variant === "deal" ? "" : labels.button}<GameIcon name="secret" size={14} /></button> : <GameIcon name="rule" size={13} />}</footer>
    {onInspect && <button type="button" className="secret-card__inspect" aria-label={`Inspect ${ownerLabel}'s example card`} aria-pressed={inspected} aria-describedby={contentId} onClick={() => { sound.play("cardSlide"); onInspect(); }}><span className="card-tooltip" aria-hidden="true">{inspected ? "TAP TO SET DOWN" : "TAKE A CLOSER LOOK"}</span></button>}
  </article>;
}
