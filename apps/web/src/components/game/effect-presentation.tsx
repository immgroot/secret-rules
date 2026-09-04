"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import {
  BUTTON_CARD_LABELS,
  type EffectButtonCardKind,
  type PublicButtonEffect,
} from "@secret-rules/shared";
import { ButtonCardArtwork, ButtonCardBack } from "./button-card.tsx";

export type EffectPresentationPhase = "pickup" | "lift" | "travel" | "land" | "activate" | "result" | "exit";
export type EffectPresentationMotion = "full" | "reduced";
export type EffectPresentationCue = "cardPickup" | "cardTravel" | "cardLand" | "inspectReveal" | "stealTransfer" | "skipStamp" | "reverse" | "shieldArm" | "shieldBlock" | "wildSelect";

export type EffectLaunchRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}>;

export type EffectLaunch = Readonly<{
  cardId: string;
  card: EffectButtonCardKind;
  rect: EffectLaunchRect;
}>;

type QueuedEffect = Readonly<{
  effect: PublicButtonEffect & { card: EffectButtonCardKind };
  origin: EffectLaunchRect | null;
  motion: EffectPresentationMotion;
}>;

export type EffectPlayback = QueuedEffect & Readonly<{ phase: EffectPresentationPhase }>;

type QueueState = Readonly<{
  active: EffectPlayback | null;
  queued: readonly QueuedEffect[];
  completedEffectId: string | null;
}>;

type QueueAction =
  | { type: "enqueue"; item: QueuedEffect }
  | { type: "advance"; effectId: string }
  | { type: "reset" };

const FULL_PHASES: readonly EffectPresentationPhase[] = ["pickup", "lift", "travel", "land", "activate", "result", "exit"];
const REDUCED_PHASES: readonly EffectPresentationPhase[] = ["activate", "result", "exit"];

function start(item: QueuedEffect): EffectPlayback {
  return { ...item, phase: item.motion === "reduced" ? "activate" : "pickup" };
}

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  if (action.type === "reset") return { active: null, queued: [], completedEffectId: null };
  if (action.type === "enqueue") {
    if (!state.active) return { ...state, active: start(action.item) };
    return { ...state, queued: [...state.queued, action.item] };
  }
  if (!state.active || state.active.effect.effectId !== action.effectId) return state;
  const phases = state.active.motion === "reduced" ? REDUCED_PHASES : FULL_PHASES;
  const phaseIndex = phases.indexOf(state.active.phase);
  const nextPhase = phases[phaseIndex + 1];
  if (nextPhase) return { ...state, active: { ...state.active, phase: nextPhase } };
  const [next, ...remaining] = state.queued;
  return {
    active: next ? start(next) : null,
    queued: remaining,
    completedEffectId: state.active.effect.effectId,
  };
}

export function useEffectPresentationQueue({ roundId, reducedMotion }: { roundId: string; reducedMotion: boolean }) {
  const [state, dispatch] = useReducer(queueReducer, { active: null, queued: [], completedEffectId: null });
  const [seen] = useState(() => new Set<string>());
  useEffect(() => {
    seen.clear();
    dispatch({ type: "reset" });
  }, [roundId, seen]);
  const enqueue = useCallback((effect: PublicButtonEffect & { card: EffectButtonCardKind }, origin: EffectLaunchRect | null) => {
    if (seen.has(effect.effectId)) return;
    seen.add(effect.effectId);
    dispatch({ type: "enqueue", item: { effect, origin, motion: reducedMotion ? "reduced" : "full" } });
  }, [reducedMotion, seen]);
  const advance = useCallback((effectId: string) => dispatch({ type: "advance", effectId }), []);
  return { ...state, enqueue, advance };
}

type FlightGeometry = Readonly<{
  card: CSSProperties;
  transfer: CSSProperties | null;
  target: CSSProperties | null;
  inspectLine: CSSProperties | null;
  table: CSSProperties | null;
  counter: CSSProperties | null;
  source: EffectLaunchRect;
  landing: EffectLaunchRect;
}>;

function rectOf(element: Element | null): EffectLaunchRect | null {
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

function seatRect(playerId: string | null) {
  return playerId ? rectOf(document.querySelector(`.player-seat[data-player-id="${playerId}"]`)) : null;
}

function remoteCardOrigin(seat: EffectLaunchRect, landing: EffectLaunchRect): EffectLaunchRect {
  const width = Math.max(58, Math.min(86, landing.width * 1.18));
  const height = width * 7 / 5;
  const centerX = seat.centerX;
  const centerY = seat.centerY + Math.min(26, seat.height * .23);
  return { left: centerX - width / 2, top: centerY - height / 2, width, height, centerX, centerY };
}

function lineBetween(from: EffectLaunchRect, to: EffectLaunchRect) {
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  return {
    "--effect-line-x": `${from.centerX}px`,
    "--effect-line-y": `${from.centerY}px`,
    "--effect-line-length": `${Math.hypot(dx, dy)}px`,
    "--effect-line-angle": `${Math.atan2(dy, dx) * 180 / Math.PI}deg`,
  } as CSSProperties;
}

function fixedRectStyle(rect: EffectLaunchRect) {
  return {
    "--effect-target-x": `${rect.left}px`,
    "--effect-target-y": `${rect.top}px`,
    "--effect-target-width": `${rect.width}px`,
    "--effect-target-height": `${rect.height}px`,
    "--effect-target-center-x": `${rect.centerX}px`,
    "--effect-target-center-y": `${rect.centerY}px`,
  } as CSSProperties;
}

function cardFlightStyle(source: EffectLaunchRect, landing: EffectLaunchRect, discard: EffectLaunchRect | null) {
  const destinationX = landing.centerX - source.width / 2;
  const destinationY = landing.centerY - source.height / 2;
  const midpointX = source.left + (destinationX - source.left) * .56;
  const midpointY = source.top + (destinationY - source.top) * .5 - Math.min(34, Math.abs(destinationY - source.top) * .08 + 18);
  const landingScale = Math.max(.42, Math.min(1.38, landing.width / source.width));
  const discardX = discard ? discard.centerX - source.width / 2 : destinationX - 48;
  const discardY = discard ? discard.centerY - source.height / 2 : destinationY + 26;
  const discardScale = discard ? Math.max(.34, Math.min(.8, discard.width / source.width)) : landingScale * .72;
  const tilt = destinationX >= source.left ? 3 : -3;
  return {
    width: `${source.width}px`,
    height: `${source.height}px`,
    "--effect-source-x": `${source.left}px`,
    "--effect-source-y": `${source.top}px`,
    "--effect-mid-x": `${midpointX}px`,
    "--effect-mid-y": `${midpointY}px`,
    "--effect-destination-x": `${destinationX}px`,
    "--effect-destination-y": `${destinationY}px`,
    "--effect-discard-x": `${discardX}px`,
    "--effect-discard-y": `${discardY}px`,
    "--effect-landing-scale": String(landingScale),
    "--effect-discard-scale": String(discardScale),
    "--effect-travel-tilt": `${tilt}deg`,
    "--effect-pickup-tilt": `${tilt * -.2}deg`,
    "--effect-lift-tilt": `${tilt * -.45}deg`,
    "--effect-settle-tilt": `${tilt * .32}deg`,
    "--effect-mid-scale": String((1.05 + landingScale) / 2),
    "--effect-land-over-scale": String(landingScale * 1.025),
    "--effect-land-under-scale": String(landingScale * .99),
  } as CSSProperties;
}

function transferFlightStyle(from: EffectLaunchRect, to: EffectLaunchRect) {
  const width = 48;
  const height = 67;
  const sourceX = from.centerX - width / 2;
  const sourceY = from.centerY - height / 2;
  const destinationX = to.centerX - width / 2;
  const destinationY = to.centerY - height / 2;
  return {
    width: `${width}px`,
    height: `${height}px`,
    "--transfer-source-x": `${sourceX}px`,
    "--transfer-source-y": `${sourceY}px`,
    "--transfer-mid-x": `${sourceX + (destinationX - sourceX) * .55}px`,
    "--transfer-mid-y": `${sourceY + (destinationY - sourceY) * .46 - 24}px`,
    "--transfer-destination-x": `${destinationX}px`,
    "--transfer-destination-y": `${destinationY}px`,
  } as CSSProperties;
}

function cueFor(effect: EffectPlayback): EffectPresentationCue | null {
  if (effect.phase === "pickup") return "cardPickup";
  if (effect.phase === "travel") return "cardTravel";
  if (effect.phase === "land") return "cardLand";
  if (effect.phase !== "activate") return null;
  if (effect.effect.type === "inspect") return "inspectReveal";
  if (effect.effect.type === "steal") return "stealTransfer";
  if (effect.effect.type === "skip") return "skipStamp";
  if (effect.effect.type === "reverse") return "reverse";
  if (effect.effect.type === "shield_blocked") return "shieldBlock";
  if (effect.effect.type === "shield") return "shieldArm";
  if (effect.effect.card === "WILD") return "wildSelect";
  return null;
}

function expectedAnimation(phase: EffectPresentationPhase, motion: EffectPresentationMotion) {
  if (motion === "reduced") return phase === "activate" ? "effect-reduced-activate" : phase === "result" ? "effect-result-clock" : "effect-reduced-exit";
  if (phase === "pickup") return "effect-card-pickup";
  if (phase === "lift") return "effect-card-lift";
  if (phase === "travel") return "effect-card-travel";
  if (phase === "land") return "effect-card-land";
  if (phase === "activate") return "effect-activation-clock";
  if (phase === "result") return "effect-result-clock";
  return "effect-card-exit";
}

export function EffectPresentationLayer({ playback, selfId, onAdvance, onCue }: {
  playback: EffectPlayback;
  selfId: string | null;
  onAdvance: (effectId: string) => void;
  onCue?: (cue: EffectPresentationCue) => void;
}) {
  const { effect, origin, phase, motion } = playback;
  const [geometry, setGeometry] = useState<FlightGeometry | null>(null);

  useLayoutEffect(() => {
    const landing = rectOf(document.querySelector(`[data-effect-landing="${effect.effectId}"]`))
      ?? rectOf(document.querySelector(".effect-landing-slot"))
      ?? rectOf(document.querySelector(".v2-play-zone"));
    if (!landing) return;
    const actorSeat = seatRect(effect.actorPlayerId);
    const source = origin ?? (actorSeat ? remoteCardOrigin(actorSeat, landing) : landing);
    const discard = rectOf(document.querySelector("[data-effect-discard]"));
    const target = seatRect(effect.targetPlayerId ?? (effect.type === "shield" ? effect.actorPlayerId : null));
    const localHand = effect.actorPlayerId === selfId ? rectOf(document.querySelector(".private-action-panel .private-hand")) : null;
    const transferTo = localHand ?? actorSeat ?? landing;
    const table = rectOf(document.querySelector(".game-table__object"));
    const counter = rectOf(document.querySelector(".v2-counter"));
    const measuredGeometry: FlightGeometry = {
      card: cardFlightStyle(source, landing, discard),
      transfer: effect.type === "steal" && target ? transferFlightStyle(target, transferTo) : null,
      target: target ? fixedRectStyle(target) : null,
      inspectLine: target ? lineBetween(landing, target) : null,
      table: table ? fixedRectStyle(table) : null,
      counter: counter ? fixedRectStyle(counter) : null,
      source,
      landing,
    };
    // Mount the clone on the next frame so its first composited animation frame
    // starts from a stable, fully measured geometry rather than the layout pass.
    const frame = requestAnimationFrame(() => setGeometry(measuredGeometry));
    return () => cancelAnimationFrame(frame);
  }, [effect.actorPlayerId, effect.effectId, effect.targetPlayerId, effect.type, origin, selfId]);

  useEffect(() => {
    const cue = cueFor(playback);
    if (cue) onCue?.(cue);
  }, [effect.effectId, onCue, phase, playback]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("effectDebug") && geometry) {
      console.info("SECRET RULES EFFECT PRESENTATION", {
        effect: effect.card,
        phase,
        source: { x: Math.round(geometry.source.left), y: Math.round(geometry.source.top) },
        destination: { x: Math.round(geometry.landing.left), y: Math.round(geometry.landing.top) },
        motion,
      });
    }
  }, [effect.card, geometry, motion, phase]);

  const finishPhase = (event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.animationName !== expectedAnimation(phase, motion)) return;
    onAdvance(effect.effectId);
  };
  const activationVisible = phase === "activate" || phase === "result";
  const targetStyle = geometry?.target;
  const effectMovement = effect.movement === null ? null : effect.movement > 0 ? `+${effect.movement}` : String(effect.movement);

  return <div
    className="effect-playback-layer"
    data-effect-id={effect.effectId}
    data-effect-kind={effect.card}
    data-effect-type={effect.type}
    data-phase={phase}
    data-ready={Boolean(geometry)}
    data-motion={motion}
    data-source-x={geometry ? Math.round(geometry.source.left) : undefined}
    data-source-y={geometry ? Math.round(geometry.source.top) : undefined}
    data-destination-x={geometry ? Math.round(geometry.landing.left) : undefined}
    data-destination-y={geometry ? Math.round(geometry.landing.top) : undefined}
    aria-hidden="true"
  >
    {motion === "full" && geometry && <div className="effect-card-clone" data-phase={phase} style={geometry.card} onAnimationEnd={finishPhase}>
      <ButtonCardArtwork kind={effect.card} context="table" />
      {effect.card === "WILD" && activationVisible && effectMovement && <span className="effect-card-clone__wild-value">{effectMovement}</span>}
    </div>}

    {motion === "reduced" && <div className="effect-reduced-confirmation" data-phase={phase} onAnimationEnd={phase === "exit" ? finishPhase : undefined}>
      <ButtonCardArtwork kind={effect.card} context="table" />
      {effect.card === "WILD" && effectMovement && <b>{effectMovement}</b>}
      <strong>{BUTTON_CARD_LABELS[effect.card]} · FACE-UP</strong>
    </div>}

    {activationVisible && <div className="effect-activation" data-effect={effect.type} data-card={effect.card} data-phase={phase}>
      {effect.type === "inspect" && targetStyle && <>
        <span className="effect-inspect-line" style={geometry?.inspectLine ?? undefined} />
        <span className="effect-target-focus effect-target-focus--inspect" style={targetStyle}><i /><i /><i /><i /></span>
        <span className="effect-public-peek-card" style={targetStyle}><ButtonCardBack /></span>
      </>}
      {effect.type === "steal" && targetStyle && <>
        <span className="effect-target-focus effect-target-focus--steal" style={targetStyle}><i /></span>
        <span className="effect-steal-transfer" style={geometry?.transfer ?? undefined}><ButtonCardBack /></span>
      </>}
      {effect.type === "skip" && targetStyle && <span className="effect-skip-stamp" style={targetStyle}>SKIP</span>}
      {effect.type === "reverse" && geometry?.table && <span className="effect-reverse-sweep" style={geometry.table}><i /></span>}
      {effect.type === "shield" && targetStyle && <span className="effect-shield-draw" style={targetStyle}><i>SHIELD</i></span>}
      {effect.type === "shield_blocked" && targetStyle && <span className="effect-shield-impact" style={targetStyle}><i>SHIELD BLOCKED IT</i><b /><b /><b /></span>}
      {phase === "result" && effect.movement !== null && effect.movement !== 0 && geometry?.counter && <span className={`effect-button-movement${effect.card === "WILD" ? " effect-button-movement--wild" : ""}`} style={geometry.counter}>BUTTON {effectMovement}</span>}
    </div>}

    {(phase === "activate" || phase === "result") && <span className={`effect-phase-clock effect-phase-clock--${phase}`} onAnimationEnd={finishPhase} />}
  </div>;
}
