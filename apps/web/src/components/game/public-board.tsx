"use client";

import { useEffect, useReducer, useRef, type CSSProperties } from "react";
import type { EffectButtonCardKind, PublicPlayer, PublicRoundState } from "@secret-rules/shared";
import { BUTTON_CARD_LABELS, isEffectButtonCard } from "@secret-rules/shared";
import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton } from "../ui/index.ts";
import { PublicPlayedCard, type PlayedCardMotion } from "./button-card.tsx";
import type { EffectPlayback } from "./effect-presentation.tsx";
import { publicEffectLabel, remainingSeconds } from "./button-presentation.ts";
import { projectVisualSeats } from "./seat-projection.ts";

export type TableNotice = { title: string; detail: string; kind: "trust" | "skip"; playerId?: string };

type TargetPresentation = "hidden" | "targetHitCelebration" | "lastChanceIntro";

function TargetStatusPresentation({ round }: { round: PublicRoundState }) {
  const game = round.publicGameState;
  const lastChanceInProgress = game.lastChanceActive && !["round_reveal", "match_complete"].includes(round.phase);
  const previousTargetSecured = useRef(game.targetSecured);
  const previousPhase = useRef(round.phase);
  const [presentation, setPresentation] = useReducer((_: TargetPresentation, next: TargetPresentation) => next, "hidden");

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    const targetWasJustSecured = !previousTargetSecured.current && game.targetSecured && round.phase === "target_vote";
    const lastChanceJustStarted = previousPhase.current === "target_vote" && round.phase === "last_chance";

    if (targetWasJustSecured) {
      setPresentation("targetHitCelebration");
    } else if (lastChanceJustStarted) {
      setPresentation("lastChanceIntro");
    } else if (round.phase !== "target_vote" && round.phase !== "last_chance") {
      setPresentation("hidden");
    }

    if (presentation === "targetHitCelebration") hideTimeout = setTimeout(() => setPresentation("hidden"), 1500);
    if (presentation === "lastChanceIntro") hideTimeout = setTimeout(() => setPresentation("hidden"), 1100);

    previousTargetSecured.current = game.targetSecured;
    previousPhase.current = round.phase;
    return () => { if (hideTimeout) clearTimeout(hideTimeout); };
  }, [game.targetSecured, presentation, round.phase]);

  return <>
    {presentation === "targetHitCelebration" && <div className="target-secured target-secured--celebration" role="status"><strong>TARGET SECURED</strong><span>THE COUNTER IS LOCKED AT {game.target}</span></div>}
    {presentation === "lastChanceIntro" && <div className="last-chance-intro" role="status"><strong>LAST CHANCE</strong><span>ONE FINAL ROTATION</span></div>}
    {game.targetSecured && (round.phase === "target_vote" || lastChanceInProgress) && <div className="target-secured-compact" data-last-chance={lastChanceInProgress} role="status"><strong>✓ TARGET SECURED</strong><span>{game.target} / {game.target}{lastChanceInProgress ? ` · ${game.lastChanceTurnsRemaining} TURNS LEFT` : " · VOTE IN PROGRESS"}</span></div>}
  </>;
}

function participant(round: PublicRoundState, players: readonly PublicPlayer[], playerId: string) {
  return players.find((candidate) => candidate.playerId === playerId)?.displayName
    ?? round.reveal?.entries.find((entry) => entry.playerId === playerId)?.displayName
    ?? "DEPARTED PLAYER";
}

function signed(value: number) { return value > 0 ? `+${value}` : String(value); }

/** Presentation frames derived only from authoritative endpoints. */
export function authoritativeCounterFrames(before: number, after: number): readonly number[] {
  if (before === after) return [after];
  const direction = after > before ? 1 : -1;
  const frames = [before];
  for (let value = before + direction; value !== after; value += direction) frames.push(value);
  frames.push(after);
  return frames.length <= 4 ? frames : [...frames.slice(0, 3), after];
}

export function PublicTurnBanner({ round, players, selfId, now }: {
  round: PublicRoundState;
  players: readonly PublicPlayer[];
  selfId: string | null;
  now: number;
}) {
  const game = round.publicGameState;
  const claim = game.currentClaim;
  const active = game.currentPlayerId ? participant(round, players, game.currentPlayerId).toUpperCase() : "THE TABLE";
  const actor = claim ? participant(round, players, claim.actorPlayerId).toUpperCase() : active;
  const localTurn = round.phase === "turn_action" && game.currentPlayerId === selfId;
  let eyebrow = "PUBLIC TURN";
  let title = localTurn ? "YOUR TURN" : `${active}’S TURN`;
  let detail = "NUMBER = BLUFF · EFFECT = DIRECT ACTION";
  if (round.phase === "challenge" && claim) {
    eyebrow = `${actor} PLAYED A CARD`;
    title = "CALL BLUFF?";
    detail = `${actor} CLAIMS ${BUTTON_CARD_LABELS[claim.claim]}`;
  } else if (round.phase === "challenge_reveal" && game.challenge?.outcome) {
    eyebrow = `${actor}’S CARD WAS CHALLENGED`;
    title = game.challenge.outcome === "bluff_caught" ? "BLUFF CAUGHT" : "FALSE ACCUSATION";
    detail = `CLAIMED ${claim ? BUTTON_CARD_LABELS[claim.claim] : "—"} · ACTUAL ${game.challenge.revealedCard ? BUTTON_CARD_LABELS[game.challenge.revealedCard] : "—"}`;
  } else if (round.phase === "penalty_discard") {
    eyebrow = "PRIVATE CHOICE IN PROGRESS";
    title = `${active} IS CHOOSING`;
    detail = "THE TABLE WILL UPDATE WHEN THE SERVER RESOLVES IT";
  } else if (round.phase === "target_vote") {
    eyebrow = "THE TARGET WAS HIT";
    title = "TABLE VOTE";
    detail = "END THE ROUND OR TAKE ONE LAST CHANCE";
  } else if (!["turn_action", "challenge", "challenge_reveal", "penalty_discard", "target_vote"].includes(round.phase)) {
    eyebrow = "PUBLIC GAME STATE";
    title = round.phase.replaceAll("_", " ").toUpperCase();
    detail = round.publicObjective.toUpperCase();
  }
  const seconds = remainingSeconds(round, now);
  return <div className="turn-banner" data-local={localTurn} data-phase={round.phase}>
    <div className="turn-banner__copy" aria-live="polite"><span>{eyebrow}</span><strong>{title}</strong><small>{detail}</small></div>
    {seconds !== null && <span className="turn-banner__timer" role="timer" aria-label={`${round.publicTimer?.kind ?? "round"} time remaining: ${seconds} seconds`}><GameIcon name="timer" size={15} />{seconds}</span>}
  </div>;
}

export function PublicBoardView({
  round,
  players,
  selfId,
  spectator,
  disabled,
  now,
  tableNotice,
  onCallBluff,
  onPassChallenge,
  cardMotion,
  effectPresentation = null,
  completedEffectId = null,
}: {
  round: PublicRoundState;
  players: readonly PublicPlayer[];
  selfId: string | null;
  spectator: boolean;
  disabled: boolean;
  now: number;
  tableNotice: TableNotice | null;
  onCallBluff?: () => void;
  onPassChallenge?: () => void;
  cardMotion?: PlayedCardMotion;
  effectPresentation?: EffectPlayback | null;
  completedEffectId?: string | null;
}) {
  const game = round.publicGameState;
  const claim = game.currentClaim;
  const actor = claim ? participant(round, players, claim.actorPlayerId) : null;
  const stateEffect = game.lastEffect?.card && isEffectButtonCard(game.lastEffect.card) ? game.lastEffect : null;
  const directEffect = effectPresentation?.effect ?? stateEffect;
  const effectSequenced = effectPresentation?.effect.effectId === directEffect?.effectId;
  const effectPhase = effectSequenced && effectPresentation ? effectPresentation.phase : null;
  const effectActivating = effectPhase === "activate" || effectPhase === "result" || effectPhase === "exit";
  const effectCompleted = !effectSequenced && directEffect?.effectId === completedEffectId;
  const showStaticEffectCard = Boolean(directEffect && !effectSequenced && !effectCompleted);
  const effectKind = directEffect?.card as EffectButtonCardKind | undefined;
  const effectActor = directEffect ? participant(round, players, directEffect.actorPlayerId) : null;
  const effectTarget = directEffect?.targetPlayerId ? participant(round, players, directEffect.targetPlayerId) : null;
  const challenge = game.challenge;
  const passedPlayerIds = challenge?.passedPlayerIds ?? [];
  const passed = Boolean(selfId && passedPlayerIds.includes(selfId));
  const canRespond = round.phase === "challenge" && Boolean(selfId && claim && claim.actorPlayerId !== selfId) && !spectator;
  const eligibleResponders = claim ? players.filter((player) => player.role === "player" && player.playerId !== claim.actorPlayerId) : [];
  const challenger = challenge?.challengerPlayerId ? participant(round, players, challenge.challengerPlayerId) : null;
  const projection = projectVisualSeats(players, selfId);
  const playedActorId = claim?.actorPlayerId ?? directEffect?.actorPlayerId ?? null;
  const actorSeat = playedActorId ? projection.seats.find((seat) => seat.player.playerId === playedActorId) : null;
  const radians = ((actorSeat?.angle ?? 0) * Math.PI) / 180;
  const cardOrigin = actorSeat ? { x: Math.round(Math.sin(radians) * 280), y: Math.round(-Math.cos(radians) * 180) } : undefined;
  const counterFrames = effectPresentation ? authoritativeCounterFrames(effectPresentation.effect.counterBefore, effectPresentation.effect.counterAfter) : [game.counter];
  const counterRolling = effectPhase === "result" || effectPhase === "exit";
  const counterBeforeResult = effectPresentation && !counterRolling ? effectPresentation.effect.counterBefore : null;
  return <section className="v2-board" data-phase={round.phase} data-effect={directEffect?.type ?? undefined} data-target-secured={game.targetSecured} aria-label="Public Button V2 state">
    <PublicTurnBanner round={round} players={players} selfId={selfId} now={now} />
    <div className="v2-card-piles"><div className="v2-deck"><span>DRAW DECK</span><i aria-hidden="true" /><strong>{game.deckRemaining}</strong></div><div className="v2-discard"><span>DISCARD</span><i data-effect-discard aria-hidden="true" /><strong>{game.discardCount}</strong></div></div>
    <div className="v2-play-zone" data-active={Boolean(claim || directEffect)} data-revealed={Boolean(challenge?.revealedCard)} data-presentation={claim ? "number" : directEffect ? "effect" : "empty"} data-effect={directEffect?.type ?? undefined} data-effect-phase={effectPhase ?? undefined}>{claim ? <>
      <PublicPlayedCard animationKey={`${claim.actorPlayerId}:${claim.claimedAt}`} revealedKind={challenge?.revealedCard ?? null} {...(cardOrigin ? { origin: cardOrigin } : {})} {...(cardMotion ? { motion: cardMotion } : {})} />
      <div className="public-claim"><span>{round.phase === "challenge" ? "NUMBER CARD · FACE-DOWN" : challenge?.revealedCard ? "CHALLENGE REVEAL" : "NUMBER CARD IN PLAY"}</span><p><b>{actor?.toUpperCase()}</b> CLAIMS <strong>{BUTTON_CARD_LABELS[claim.claim]}</strong></p>{round.phase === "challenge" && claim.actorPlayerId === selfId && <small>WAITING FOR THE TABLE…</small>}</div>
      {challenge?.outcome && <div className="challenge-result" data-outcome={challenge.outcome}><span>{challenger?.toUpperCase()} CALLED BLUFF</span><strong>{challenge.outcome === "bluff_caught" ? "BLUFF CAUGHT" : "FALSE ACCUSATION"}</strong><p><b>CLAIMED {BUTTON_CARD_LABELS[claim.claim]}</b><b>ACTUAL {challenge.revealedCard ? BUTTON_CARD_LABELS[challenge.revealedCard] : "—"}</b></p></div>}
      {round.phase === "challenge" && eligibleResponders.length > 0 && <div className="challenge-status" aria-label="Challenge decisions" aria-live="polite">{eligibleResponders.map((player) => <span key={player.playerId} data-state={passedPlayerIds.includes(player.playerId) ? "passed" : "thinking"}><b>{player.displayName.toUpperCase()}</b> · {passedPlayerIds.includes(player.playerId) ? "PASSED" : "THINKING"}</span>)}</div>}
      {canRespond && onCallBluff && onPassChallenge && <div className="call-bluff-anchor challenge-actions"><GameButton className="call-bluff" variant="danger" disabled={disabled || passed} onClick={onCallBluff}>CALL BLUFF</GameButton><GameButton className="pass-challenge" variant="secondary" disabled={disabled || passed} onClick={onPassChallenge}>{passed ? "YOU PASSED" : "PASS"}</GameButton></div>}
    </> : directEffect && effectKind ? <>
      {showStaticEffectCard
        ? <PublicPlayedCard key={directEffect.effectId} animationKey={directEffect.effectId} revealedKind={null} faceUpKind={effectKind} {...(cardOrigin ? { origin: cardOrigin } : {})} {...(cardMotion ? { motion: cardMotion } : {})} />
        : <div className="effect-landing-slot" data-effect-landing={directEffect.effectId} aria-hidden="true" />}
      <div className="public-claim public-effect-play" data-sequenced={effectSequenced} data-visible={effectActivating || !effectSequenced} data-phase={effectPhase ?? undefined}><span>EFFECT CARD · FACE-UP</span><p><b>{effectActor?.toUpperCase()}</b> {directEffect.type === "steal" ? "STOLE A CARD" : directEffect.type === "inspect" ? "INSPECTED" : "PLAYED"} <strong>{directEffect.type === "steal" ? `FROM ${effectTarget?.toUpperCase() ?? "A PLAYER"}` : directEffect.type === "inspect" ? effectTarget?.toUpperCase() : BUTTON_CARD_LABELS[effectKind]}</strong>{effectTarget && !["steal", "inspect"].includes(directEffect.type) && <small>ON {effectTarget.toUpperCase()}</small>}</p><em>{directEffect.type === "shield_blocked" ? "SHIELD BLOCKED IT" : directEffect.type === "skip" && effectTarget ? `${effectTarget.toUpperCase()} WILL SKIP THEIR NEXT TURN` : directEffect.type === "reverse" ? "DIRECTION REVERSED" : directEffect.type === "inspect" ? "RESULT SENT PRIVATELY" : directEffect.type === "steal" ? "CARD IDENTITY STAYS PRIVATE" : directEffect.card === "WILD" && directEffect.movement !== null ? `WILD ${signed(directEffect.movement)}` : directEffect.type === "shield" ? "SHIELD ARMED" : "EFFECT RESOLVED"}</em></div>
      {showStaticEffectCard && directEffect.card === "WILD" && directEffect.movement !== null && <div key={`wild:${directEffect.effectId}`} className="wild-effect-value" role="status"><span>WILD</span><strong>{signed(directEffect.movement)}</strong></div>}
    </> : <><div className="empty-card-slot" aria-hidden="true"><GameIcon name="rule" size={22} /></div><p className="empty-play-copy">PLAYED CARD<br /><span>WAITING FOR THE ACTIVE PLAYER</span></p></>}
      {tableNotice && <div key={`${tableNotice.kind}:${tableNotice.title}`} className="table-resolution-notice" data-kind={tableNotice.kind} role="status"><strong>{tableNotice.title}</strong><span>{tableNotice.detail}</span>{tableNotice.kind === "trust" && <i aria-hidden="true" />}</div>}
    </div>
    <div className="v2-counter" data-counter-phase={effectPhase ?? undefined} data-rolling={counterRolling}><span>BUTTON</span><strong aria-live="polite" aria-label={`Button counter ${game.counter}`}>{counterBeforeResult !== null ? counterBeforeResult : counterRolling ? <span className="v2-counter__steps" style={{ "--counter-offset": `${-(counterFrames.length - 1)}em`, "--counter-hops": Math.max(1, counterFrames.length - 1) } as CSSProperties}>{counterFrames.map((value, index) => <i key={`${value}:${index}`} data-final={index === counterFrames.length - 1}>{value}</i>)}</span> : game.counter}</strong><small>EXACT TARGET <b>{game.target}</b></small><button className="v2-red-button" tabIndex={-1} aria-hidden="true"><i /></button></div>
    <div key={directEffect?.type === "reverse" ? directEffect.effectId : game.direction} className="v2-direction" data-direction={game.direction} data-reversed={directEffect?.type === "reverse" && effectPhase === "activate"} data-sequenced={effectSequenced}><span>↻</span>{game.direction.replace("_", " ").toUpperCase()}</div>
    {game.lastEffect && <div className="v2-effect" role="status"><span>{publicEffectLabel(game.lastEffect.type)}</span><strong>{game.lastEffect.movement === null ? "RESOLVED" : signed(game.lastEffect.movement)}</strong><small>{game.lastEffect.counterBefore} → {game.lastEffect.counterAfter}</small></div>}
    <TargetStatusPresentation round={round} />
  </section>;
}
