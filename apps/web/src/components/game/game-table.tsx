import type { CSSProperties, ReactNode } from "react";
import type { PublicPlayer, PublicRoundState } from "@secret-rules/shared";
import { PlayerBadge } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";
import type { EffectPlayback } from "./effect-presentation.tsx";
import { projectVisualSeats, type VisualSeat } from "./seat-projection.ts";

type SeatProps = {
  seat: VisualSeat; round: PublicRoundState;
  acknowledged: boolean; effectCue: EffectPlayback | null; emphasized: boolean; skipConsumed: boolean; choose: (player: PublicPlayer) => void;
};

function PlayerSeat({ seat, round, acknowledged, effectCue, emphasized, skipConsumed, choose }: SeatProps) {
  const { player, angle, local: self } = seat;
  const style = { "--seat-angle": `${angle}deg`, "--seat-angle-inverse": `${-angle}deg` } as CSSProperties;
  const game = round.publicGameState;
  const active = game.currentPlayerId === player.playerId;
  const shielded = game.shieldedPlayerIds.includes(player.playerId);
  const skipped = game.skippedPlayerIds.includes(player.playerId);
  const cards = game.handCounts.find((entry) => entry.playerId === player.playerId)?.count ?? 0;
  const activeState = round.phase === "challenge" ? self ? "YOUR CARD · WAITING" : "CARD PLAYED" : round.phase === "challenge_reveal" ? "CARD REVEALED" : self ? "YOUR TURN" : "ACTIVE TURN";
  const state = !player.connected ? "RECONNECTING…" : player.afk ? "AFK" : round.phase === "rule_ack" ? acknowledged ? "READY ✓" : "READING…" : active ? activeState : skipped ? "SKIP NEXT" : self ? "YOU · FRONT" : "";
  const cueLabel = effectCue?.effect.type === "skip" ? "SKIP ARMED"
    : effectCue?.effect.type === "shield" ? "SHIELD ARMED"
      : effectCue?.effect.type === "shield_blocked" ? "SHIELD BLOCKED IT"
        : effectCue?.effect.type === "inspect" ? "INSPECT TARGET"
          : effectCue?.effect.type === "steal" ? "STEAL TARGET" : null;
  return <button className="player-seat" style={style} data-player-id={player.playerId} data-active={active} data-connected={player.connected} data-emphasized={emphasized || Boolean(effectCue)} data-effect-phase={effectCue?.phase} data-effect-kind={effectCue?.effect.type} data-shielded={shielded} data-shield-arming={effectCue?.effect.type === "shield"} data-skipped={skipped} data-skip-consumed={skipConsumed} data-local={self} data-seat-index={seat.visualIndex} data-seat-position={seat.position} data-round-phase={round.phase} aria-current={active ? "true" : undefined} onClick={() => choose(player)} aria-label={`View ${player.displayName}'s profile. ${cards} cards${self ? ", your front seat" : ""}${active ? ", active turn" : ""}.`}>
    <PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} host={player.isHost} reaction={active ? "press" : "idle"} />
    <span className="player-seat__cards" aria-label={`${cards} cards`}>{cards} CARDS</span>
    {shielded && <span className="player-seat__shield">SHIELD</span>}
    {skipped && <span className="player-seat__skip-badge"><GameIcon name="skip" size={12} /> SKIP ARMED</span>}
    {skipConsumed && <span className="player-seat__skip-consumed"><strong>SKIPPED</strong><i /></span>}
    {cueLabel && <span key={effectCue?.effect.effectId} className="player-seat__effect-cue" data-effect={effectCue?.effect.type} role="status"><GameIcon name={effectCue?.effect.type === "skip" ? "skip" : effectCue?.effect.type === "steal" ? "steal" : effectCue?.effect.type === "inspect" ? "inspect" : "shield"} size={18} /><strong>{cueLabel}</strong>{effectCue?.effect.type === "inspect" && <i className="player-seat__inspect-brackets" />}{effectCue?.effect.type === "steal" && <i className="player-seat__steal-pull" />}</span>}
    {state && <span className="player-seat__state">{state}</span>}
  </button>;
}

export function GameTable({ players, playerId, round, acknowledgedPlayerIds, choosePlayer, children, eventFeed, privateControls, privateSecondaryAction, effectPresentation = null, skippedNoticePlayerId = null, emphasizedPlayerId = null }: {
  players: readonly PublicPlayer[]; playerId: string | null; round: PublicRoundState;
  acknowledgedPlayerIds: ReadonlySet<string>; choosePlayer: (player: PublicPlayer) => void;
  children: ReactNode; eventFeed: ReactNode; privateControls?: ReactNode; privateSecondaryAction?: ReactNode; effectPresentation?: EffectPlayback | null; skippedNoticePlayerId?: string | null; emphasizedPlayerId?: string | null;
}) {
  const projection = projectVisualSeats(players, playerId);
  const localSeat = projection.seats.find((seat) => seat.local);
  const perimeterSeats = projection.seats.filter((seat) => !seat.local);
  const renderSeat = (seat: VisualSeat) => {
    const effectTargetId = effectPresentation?.effect.type === "shield" ? effectPresentation.effect.actorPlayerId : effectPresentation?.effect.targetPlayerId;
    const cueActive = effectPresentation && ["activate", "result"].includes(effectPresentation.phase) && effectTargetId === seat.player.playerId;
    return <PlayerSeat key={seat.player.playerId} seat={seat} round={round} acknowledged={acknowledgedPlayerIds.has(seat.player.playerId)} effectCue={cueActive ? effectPresentation : null} emphasized={seat.player.playerId === emphasizedPlayerId} skipConsumed={seat.player.playerId === skippedNoticePlayerId} choose={choosePlayer} />;
  };
  return <><div className="game-table" data-effect-phase={effectPresentation?.phase} data-effect-kind={effectPresentation?.effect.type} aria-label="The Button V2 table">
    <div className="player-seats" data-count={players.length} data-orientation={projection.orientation} data-direction={round.publicGameState.direction} data-current-player-id={round.publicGameState.currentPlayerId ?? undefined} aria-label={projection.orientation === "player" ? "Player-relative table seats. Your seat is at the front." : "Neutral spectator table seats."}>
      <div className="player-seats__others">{perimeterSeats.map(renderSeat)}</div>
      {localSeat && !privateControls && <div className="player-seats__local">{renderSeat(localSeat)}</div>}
    </div>
    <div className="game-table__object"><div className="game-table__surface">
      <span className="table-fastener table-fastener--nw" aria-hidden="true" /><span className="table-fastener table-fastener--ne" aria-hidden="true" />
      <span className="table-fastener table-fastener--sw" aria-hidden="true" /><span className="table-fastener table-fastener--se" aria-hidden="true" />
      <span className="table-etching" aria-hidden="true">SECRET RULES · NUMBERS BLUFF · EFFECTS ACT</span>
      <div className="game-table__center">{children}</div>
    </div></div>
    {eventFeed}
  </div>{localSeat && privateControls && <section className="game-private-region" aria-label="Your front seat and private controls">
    <div className="game-private-region__identity">{renderSeat(localSeat)}{privateSecondaryAction}</div>
    <div id="private-actions">{privateControls}</div>
  </section>}</>;
}
