import type { PublicPlayer, PublicRoundState } from "@secret-rules/shared";
import { BUTTON_CARD_LABELS } from "@secret-rules/shared";
import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton } from "../ui/index.ts";
import { PublicPlayedCard, type PlayedCardMotion } from "./button-card.tsx";
import { publicEffectLabel, remainingSeconds } from "./button-presentation.ts";
import { projectVisualSeats } from "./seat-projection.ts";

export type TableNotice = { title: string; detail: string; kind: "trust" | "skip" };

function participant(round: PublicRoundState, players: readonly PublicPlayer[], playerId: string) {
  return players.find((candidate) => candidate.playerId === playerId)?.displayName
    ?? round.reveal?.entries.find((entry) => entry.playerId === playerId)?.displayName
    ?? "DEPARTED PLAYER";
}

function signed(value: number) { return value > 0 ? `+${value}` : String(value); }

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
  let detail = "TURN ACTION · PLAY FACE-DOWN · MAKE A CLAIM";
  if (round.phase === "challenge" && claim) {
    eyebrow = `${actor} PLAYED A CARD`;
    title = "CALL BLUFF?";
    detail = `${actor} CLAIMS ${BUTTON_CARD_LABELS[claim.claim]}`;
  } else if (round.phase === "challenge_reveal" && game.challenge?.outcome) {
    eyebrow = `${actor}’S CARD WAS CHALLENGED`;
    title = game.challenge.outcome === "bluff_caught" ? "BLUFF CAUGHT" : "FALSE ACCUSATION";
    detail = `CLAIMED ${claim ? BUTTON_CARD_LABELS[claim.claim] : "—"} · ACTUAL ${game.challenge.revealedCard ? BUTTON_CARD_LABELS[game.challenge.revealedCard] : "—"}`;
  } else if (["penalty_discard", "effect_choice"].includes(round.phase)) {
    eyebrow = "PRIVATE CHOICE IN PROGRESS";
    title = `${active} IS CHOOSING`;
    detail = "THE TABLE WILL UPDATE WHEN THE SERVER RESOLVES IT";
  } else if (round.phase === "target_vote") {
    eyebrow = "THE TARGET WAS HIT";
    title = "TABLE VOTE";
    detail = "END THE ROUND OR TAKE ONE LAST CHANCE";
  } else if (!["turn_action", "challenge", "challenge_reveal", "penalty_discard", "effect_choice", "target_vote"].includes(round.phase)) {
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
  cardMotion,
}: {
  round: PublicRoundState;
  players: readonly PublicPlayer[];
  selfId: string | null;
  spectator: boolean;
  disabled: boolean;
  now: number;
  tableNotice: TableNotice | null;
  onCallBluff?: () => void;
  cardMotion?: PlayedCardMotion;
}) {
  const game = round.publicGameState;
  const claim = game.currentClaim;
  const actor = claim ? participant(round, players, claim.actorPlayerId) : null;
  const target = claim?.targetPlayerId ? participant(round, players, claim.targetPlayerId) : null;
  const canChallenge = round.phase === "challenge" && Boolean(selfId && claim && claim.actorPlayerId !== selfId) && !spectator;
  const challenge = game.challenge;
  const challenger = challenge?.challengerPlayerId ? participant(round, players, challenge.challengerPlayerId) : null;
  const projection = projectVisualSeats(players, selfId);
  const actorSeat = claim ? projection.seats.find((seat) => seat.player.playerId === claim.actorPlayerId) : null;
  const radians = ((actorSeat?.angle ?? 0) * Math.PI) / 180;
  const cardOrigin = actorSeat ? { x: Math.round(Math.sin(radians) * 280), y: Math.round(-Math.cos(radians) * 180) } : undefined;
  return <section className="v2-board" data-phase={round.phase} data-target-secured={game.targetSecured} aria-label="Public Button V2 state">
    <PublicTurnBanner round={round} players={players} selfId={selfId} now={now} />
    <div className="v2-card-piles"><div className="v2-deck"><span>DRAW DECK</span><i aria-hidden="true" /><strong>{game.deckRemaining}</strong></div><div className="v2-discard"><span>DISCARD</span><i aria-hidden="true" /><strong>{game.discardCount}</strong></div></div>
    <div className="v2-play-zone" data-active={Boolean(claim)} data-revealed={Boolean(challenge?.revealedCard)}>{claim ? <>
      <PublicPlayedCard animationKey={`${claim.actorPlayerId}:${claim.claimedAt}`} revealedKind={challenge?.revealedCard ?? null} {...(cardOrigin ? { origin: cardOrigin } : {})} {...(cardMotion ? { motion: cardMotion } : {})} />
      <div className="public-claim"><span>{round.phase === "challenge" ? "FACE-DOWN · IDENTITY HIDDEN" : challenge?.revealedCard ? "CHALLENGE REVEAL" : "CARD IN PLAY"}</span><p><b>{actor?.toUpperCase()}</b> CLAIMS <strong>{BUTTON_CARD_LABELS[claim.claim]}</strong>{target && <> <em>→</em> <b>{target.toUpperCase()}</b></>}</p>{round.phase === "challenge" && claim.actorPlayerId === selfId && <small>WAITING FOR THE TABLE…</small>}</div>
      {challenge?.outcome && <div className="challenge-result" data-outcome={challenge.outcome}><span>{challenger?.toUpperCase()} CALLED BLUFF</span><strong>{challenge.outcome === "bluff_caught" ? "BLUFF CAUGHT" : "FALSE ACCUSATION"}</strong><p><b>CLAIMED {BUTTON_CARD_LABELS[claim.claim]}</b><b>ACTUAL {challenge.revealedCard ? BUTTON_CARD_LABELS[challenge.revealedCard] : "—"}</b></p></div>}
      {canChallenge && onCallBluff && <div className="call-bluff-anchor"><GameButton className="call-bluff" variant="danger" disabled={disabled} onClick={onCallBluff}>CALL BLUFF</GameButton></div>}
    </> : <><div className="empty-card-slot" aria-hidden="true"><GameIcon name="rule" size={22} /></div><p className="empty-play-copy">PLAYED CARD<br /><span>WAITING FOR THE ACTIVE PLAYER</span></p></>}
      {tableNotice && <div key={`${tableNotice.kind}:${tableNotice.title}`} className="table-resolution-notice" data-kind={tableNotice.kind} role="status"><strong>{tableNotice.title}</strong><span>{tableNotice.detail}</span>{tableNotice.kind === "trust" && <i aria-hidden="true" />}</div>}
    </div>
    <div className="v2-counter"><span>BUTTON</span><strong aria-live="polite">{game.counter}</strong><small>EXACT TARGET <b>{game.target}</b></small><button className="v2-red-button" tabIndex={-1} aria-hidden="true"><i /></button></div>
    <div className="v2-direction" data-direction={game.direction}><span>↻</span>{game.direction.replace("_", " ").toUpperCase()}</div>
    {game.lastEffect && <div className="v2-effect" role="status"><span>{publicEffectLabel(game.lastEffect.type)}</span><strong>{game.lastEffect.movement === null ? "RESOLVED" : signed(game.lastEffect.movement)}</strong><small>{game.lastEffect.counterBefore} → {game.lastEffect.counterAfter}</small></div>}
    {game.targetSecured && <div className="target-secured"><strong>TARGET SECURED</strong><span>THE COUNTER IS LOCKED AT {game.target}</span></div>}
    {round.phase === "last_chance" && <div className="last-chance-banner">LAST CHANCE · {game.lastChanceTurnsRemaining} TURNS REMAIN</div>}
  </section>;
}
