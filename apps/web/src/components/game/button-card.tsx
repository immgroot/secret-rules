import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { BUTTON_CARD_LABELS, NUMBER_BUTTON_CARDS, type ButtonCardKind, type EffectButtonCardKind, type NumberButtonCardKind } from "@secret-rules/shared";
import { LogoMark } from "../brand/logo.tsx";
import { GameIcon, type IconName } from "../icons/game-icon.tsx";

const CARD_DETAILS: Readonly<Record<ButtonCardKind, { description: string; code: string; icon: IconName | null }>> = Object.freeze({
  PLUS_ONE: { description: "MOVE THE BUTTON.", code: "+01", icon: null },
  PLUS_TWO: { description: "MOVE THE BUTTON.", code: "+02", icon: null },
  PLUS_THREE: { description: "MOVE THE BUTTON.", code: "+03", icon: null },
  MINUS_ONE: { description: "PULL IT BACK.", code: "-01", icon: null },
  MINUS_TWO: { description: "PULL IT BACK.", code: "-02", icon: null },
  SKIP: { description: "THEY DON’T GET A TURN.", code: "S01", icon: "skip" },
  STEAL: { description: "TAKE ONE RANDOM CARD.", code: "S02", icon: "steal" },
  INSPECT: { description: "SEE ONE CARD. KEEP QUIET.", code: "S03", icon: "inspect" },
  REVERSE: { description: "TURN THE TABLE AROUND.", code: "R01", icon: "reverse" },
  SHIELD: { description: "NOT THIS TIME.", code: "P01", icon: "shield" },
  WILD: { description: "YOUR CALL.", code: "W01", icon: "wild" },
});

export function ButtonCardArtwork({ kind, context = "button" }: { kind: ButtonCardKind; context?: "button" | "claim" | "table" }) {
  const detail = CARD_DETAILS[kind];
  return <span className="button-card-art" data-kind={kind} data-context={context} aria-hidden="true">
    <span className="button-card-art__registration">SR<span>·</span>{detail.code}</span>
    <span className="button-card-art__body">
      {detail.icon && <GameIcon name={detail.icon} size={30} />}
      <strong>{BUTTON_CARD_LABELS[kind]}</strong>
      {kind === "WILD" && <span className="button-card-art__wild-values">+1&nbsp; +2<br />-1&nbsp; -2</span>}
      <small>{detail.description}</small>
    </span>
    <span className="button-card-art__footer"><span>BUTTON CARD</span><b>{detail.code}</b></span>
  </span>;
}

export function ButtonCardChoice({ kind, selected = false, purpose, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: ButtonCardKind; selected?: boolean; purpose: "real" | "claim" | "discard";
}) {
  const prefix = purpose === "real" ? selected ? "Selected real card" : "Private card" : purpose === "claim" ? "Public claim" : "Discard";
  return <button type="button" className={`button-card button-card--${purpose} ${className}`} data-kind={kind} data-selected={selected} aria-pressed={selected} aria-label={`${prefix}: ${BUTTON_CARD_LABELS[kind]}`} {...props}>
    <span className="button-card__privacy">{purpose === "claim" ? "PUBLIC CLAIM" : purpose === "discard" ? "PRIVATE DISCARD" : selected ? "REAL CARD · PRIVATE" : "PRIVATE CARD"}</span>
    <ButtonCardArtwork kind={kind} context={purpose === "claim" ? "claim" : "button"} />
  </button>;
}

export function ClaimCardPicker({ value, disabled, onSelect }: { value: NumberButtonCardKind | null; disabled: boolean; onSelect: (kind: NumberButtonCardKind) => void }) {
  return <div className="claim-card-picker" role="group" aria-label="Choose the Number Card you claim you played">
    {NUMBER_BUTTON_CARDS.map((kind) => <ButtonCardChoice key={kind} kind={kind} purpose="claim" selected={value === kind} disabled={disabled} onClick={() => onSelect(kind)} />)}
  </div>;
}

export function ButtonCardBack({ className = "" }: { className?: string }) {
  return <span className={`button-card-back ${className}`} aria-label="Face-down SECRET RULES card">
    <span className="button-card-back__marks" aria-hidden="true">+ &nbsp; · &nbsp; +</span>
    <LogoMark aria-hidden="true" />
    <strong>SECRET<br />RULES</strong>
    <small>SAME GAME.<br />DIFFERENT RULES.</small>
  </span>;
}

export type PlayedCardMotion = { arrivalProgress: number; revealProgress: number };

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

export function PublicPlayedCard({ revealedKind, faceUpKind = null, animationKey, origin, motion, effectLanding = false }: { revealedKind: ButtonCardKind | null; faceUpKind?: EffectButtonCardKind | null; animationKey: string; origin?: { x: number; y: number }; motion?: PlayedCardMotion; effectLanding?: boolean }) {
  const arrival = clampProgress(motion?.arrivalProgress ?? 1);
  const ease = 1 - Math.pow(1 - arrival, 3);
  const style = {
    ...(origin ? { "--played-origin-x": `${origin.x}px`, "--played-origin-y": `${origin.y}px` } : {}),
    ...(motion ? { transform: `translate3d(${(origin?.x ?? 0) * (1 - ease)}px, ${(origin?.y ?? 0) * (1 - ease)}px, 0) rotate(${(1 - ease) * -8}deg) scale(${.72 + ease * .28})`, opacity: .2 + ease * .8 } : {}),
  } as CSSProperties;
  const visibleKind = faceUpKind ?? revealedKind;
  const innerStyle = motion ? { transform: `rotateY(${faceUpKind ? 180 : clampProgress(motion.revealProgress) * 180}deg)` } : undefined;
  const label = faceUpKind ? `Face-up Effect card: ${BUTTON_CARD_LABELS[faceUpKind]}` : revealedKind ? `Revealed Number card: ${BUTTON_CARD_LABELS[revealedKind]}` : "Face-down SECRET RULES card. Real Number hidden.";
  return <div className="played-card" role="img" aria-label={label} data-animation-key={animationKey} data-effect-landing={effectLanding ? animationKey : undefined} data-revealed={Boolean(visibleKind)} data-face-up={Boolean(faceUpKind)} data-scripted={Boolean(motion)} data-flight-arrival={effectLanding} style={style}>
    <span className="played-card__inner" style={innerStyle} aria-hidden="true">
      <span className="played-card__face played-card__back"><ButtonCardBack /></span>
      {visibleKind && <span className="played-card__face played-card__front"><ButtonCardArtwork kind={visibleKind} context="table" /></span>}
    </span>
  </div>;
}
