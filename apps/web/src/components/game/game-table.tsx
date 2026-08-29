import type { CSSProperties, ReactNode } from "react";
import type { PublicPlayer } from "@secret-rules/shared";
import { PlayerBadge } from "../ui/index.ts";

type PlayerSeatProps = {
  player: PublicPlayer;
  index: number;
  count: number;
  self: boolean;
  readingPhase: boolean;
  acknowledged: boolean;
  pressed: boolean;
  choose: (player: PublicPlayer) => void;
};

function PlayerSeat({ player, index, count, self, readingPhase, acknowledged, pressed, choose }: PlayerSeatProps) {
  const topGap = count >= 9 ? 64 : count >= 7 ? 60 : count >= 5 ? 70 : 90;
  const angle = topGap / 2 + ((360 - topGap) / (count - 1)) * index;
  const style = { "--seat-angle": `${angle}deg`, "--seat-angle-inverse": `${-angle}deg` } as CSSProperties;
  const state = !player.connected ? "RECONNECTING…" : player.afk ? "AFK" : readingPhase ? acknowledged ? "READY ✓" : "READING…" : pressed ? "PRESSED" : self ? "YOU" : "";
  return <button className="player-seat" style={style} data-connected={player.connected} data-pressed={pressed} onClick={() => choose(player)} aria-label={`View ${player.displayName}'s profile`}>
    <PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} host={player.isHost} reaction={pressed ? "press" : "idle"} />
    {state && <span className="player-seat__state">{state}</span>}
  </button>;
}

export function GameTable({ players, playerId, readingPhase, acknowledgedPlayerIds, pressedPlayerId, choosePlayer, children, eventFeed }: {
  players: readonly PublicPlayer[];
  playerId: string | null;
  readingPhase: boolean;
  acknowledgedPlayerIds: ReadonlySet<string>;
  pressedPlayerId: string | null;
  choosePlayer: (player: PublicPlayer) => void;
  children: ReactNode;
  eventFeed: ReactNode;
}) {
  return <div className="game-table" aria-label="The Button table">
    <div className="game-table__object">
      <div className="game-table__surface">
        <span className="table-fastener table-fastener--nw" aria-hidden="true" />
        <span className="table-fastener table-fastener--ne" aria-hidden="true" />
        <span className="table-fastener table-fastener--sw" aria-hidden="true" />
        <span className="table-fastener table-fastener--se" aria-hidden="true" />
        <span className="table-etching" aria-hidden="true">SECRET RULES · ONE TABLE · DIFFERENT MOTIVES</span>
        <div className="player-seats" data-count={players.length}>{players.map((player, index) => <PlayerSeat key={player.playerId} player={player} index={index} count={players.length} self={player.playerId === playerId} readingPhase={readingPhase} acknowledged={acknowledgedPlayerIds.has(player.playerId)} pressed={pressedPlayerId === player.playerId} choose={choosePlayer} />)}</div>
        <div className="game-table__center">{children}</div>
      </div>
    </div>
    {eventFeed}
  </div>;
}
