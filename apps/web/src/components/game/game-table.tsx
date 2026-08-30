import type { CSSProperties, ReactNode } from "react";
import type { PublicPlayer, PublicRoundState } from "@secret-rules/shared";
import { PlayerBadge } from "../ui/index.ts";
import { projectVisualSeats, type VisualSeat } from "./seat-projection.ts";

type SeatProps = {
  seat: VisualSeat; round: PublicRoundState;
  acknowledged: boolean; choose: (player: PublicPlayer) => void;
};

function PlayerSeat({ seat, round, acknowledged, choose }: SeatProps) {
  const { player, angle, local: self } = seat;
  const style = { "--seat-angle": `${angle}deg`, "--seat-angle-inverse": `${-angle}deg` } as CSSProperties;
  const game = round.publicGameState;
  const active = game.currentPlayerId === player.playerId;
  const shielded = game.shieldedPlayerIds.includes(player.playerId);
  const skipped = game.skippedPlayerIds.includes(player.playerId);
  const cards = game.handCounts.find((entry) => entry.playerId === player.playerId)?.count ?? 0;
  const state = !player.connected ? "RECONNECTING…" : player.afk ? "AFK" : round.phase === "rule_ack" ? acknowledged ? "READY ✓" : "READING…" : active ? self ? "YOUR TURN" : "PLAYING" : skipped ? "SKIP NEXT" : self ? "YOU · FRONT" : "";
  return <button className="player-seat" style={style} data-active={active} data-connected={player.connected} data-local={self} data-seat-index={seat.visualIndex} data-seat-position={seat.position} onClick={() => choose(player)} aria-label={`View ${player.displayName}'s profile. ${cards} cards${self ? ", your front seat" : ""}${active ? ", active turn" : ""}.`}>
    <PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} host={player.isHost} reaction={active ? "press" : "idle"} />
    <span className="player-seat__cards" aria-label={`${cards} cards`}>{cards} CARDS</span>
    {shielded && <span className="player-seat__shield">SHIELD</span>}
    {state && <span className="player-seat__state">{state}</span>}
  </button>;
}

export function GameTable({ players, playerId, round, acknowledgedPlayerIds, choosePlayer, children, eventFeed }: {
  players: readonly PublicPlayer[]; playerId: string | null; round: PublicRoundState;
  acknowledgedPlayerIds: ReadonlySet<string>; choosePlayer: (player: PublicPlayer) => void;
  children: ReactNode; eventFeed: ReactNode;
}) {
  const projection = projectVisualSeats(players, playerId);
  const localSeat = projection.seats.find((seat) => seat.local);
  const perimeterSeats = projection.seats.filter((seat) => !seat.local);
  const renderSeat = (seat: VisualSeat) => <PlayerSeat key={seat.player.playerId} seat={seat} round={round} acknowledged={acknowledgedPlayerIds.has(seat.player.playerId)} choose={choosePlayer} />;
  return <div className="game-table" aria-label="The Button V2 table">
    <div className="player-seats" data-count={players.length} data-orientation={projection.orientation} data-direction={round.publicGameState.direction} data-current-player-id={round.publicGameState.currentPlayerId ?? undefined} aria-label={projection.orientation === "player" ? "Player-relative table seats. Your seat is at the front." : "Neutral spectator table seats."}>
      <div className="player-seats__others">{perimeterSeats.map(renderSeat)}</div>
      {localSeat && <div className="player-seats__local">{renderSeat(localSeat)}</div>}
    </div>
    <div className="game-table__object"><div className="game-table__surface">
      <span className="table-fastener table-fastener--nw" aria-hidden="true" /><span className="table-fastener table-fastener--ne" aria-hidden="true" />
      <span className="table-fastener table-fastener--sw" aria-hidden="true" /><span className="table-fastener table-fastener--se" aria-hidden="true" />
      <span className="table-etching" aria-hidden="true">SECRET RULES · PLAY HIDDEN · CLAIM ANYTHING</span>
      <div className="game-table__center">{children}</div>
    </div></div>
    {eventFeed}
  </div>;
}
