import type { CSSProperties, ReactNode } from "react";
import type { PublicPlayer, PublicRoundState } from "@secret-rules/shared";
import { PlayerBadge } from "../ui/index.ts";

type SeatProps = {
  player: PublicPlayer; index: number; count: number; self: boolean; round: PublicRoundState;
  acknowledged: boolean; choose: (player: PublicPlayer) => void;
};

function PlayerSeat({ player, index, count, self, round, acknowledged, choose }: SeatProps) {
  const angle = -90 + (360 / count) * index;
  const style = { "--seat-angle": `${angle}deg`, "--seat-angle-inverse": `${-angle}deg` } as CSSProperties;
  const game = round.publicGameState;
  const active = game.currentPlayerId === player.playerId;
  const shielded = game.shieldedPlayerIds.includes(player.playerId);
  const skipped = game.skippedPlayerIds.includes(player.playerId);
  const cards = game.handCounts.find((entry) => entry.playerId === player.playerId)?.count ?? 0;
  const state = !player.connected ? "RECONNECTING…" : player.afk ? "AFK" : round.phase === "rule_ack" ? acknowledged ? "READY ✓" : "READING…" : active ? "YOUR TURN" : skipped ? "SKIP NEXT" : self ? "YOU" : "";
  return <button className="player-seat" style={style} data-active={active} data-connected={player.connected} onClick={() => choose(player)} aria-label={`View ${player.displayName}'s profile. ${cards} cards${active ? ", active turn" : ""}.`}>
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
  return <div className="game-table" aria-label="The Button V2 table">
    <div className="player-seats" data-count={players.length}>{players.map((player, index) => <PlayerSeat key={player.playerId} player={player} index={index} count={players.length} self={player.playerId === playerId} round={round} acknowledged={acknowledgedPlayerIds.has(player.playerId)} choose={choosePlayer} />)}</div>
    <div className="game-table__object"><div className="game-table__surface">
      <span className="table-fastener table-fastener--nw" aria-hidden="true" /><span className="table-fastener table-fastener--ne" aria-hidden="true" />
      <span className="table-fastener table-fastener--sw" aria-hidden="true" /><span className="table-fastener table-fastener--se" aria-hidden="true" />
      <span className="table-etching" aria-hidden="true">SECRET RULES · PLAY HIDDEN · CLAIM ANYTHING</span>
      <div className="game-table__center">{children}</div>
    </div></div>
    {eventFeed}
  </div>;
}
