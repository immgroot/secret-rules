import type { PublicPlayer } from "@secret-rules/shared";

export type VisualSeat = {
  player: PublicPlayer;
  visualIndex: number;
  angle: number;
  local: boolean;
  position: "front" | "perimeter";
};

export type VisualSeatProjection = {
  orientation: "player" | "spectator";
  logicalPlayerIds: string[];
  seats: VisualSeat[];
};

const normalizeAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;

/** Rotate presentation only. The authoritative array and every stable player ID remain untouched. */
export function projectVisualSeats(players: readonly PublicPlayer[], viewerPlayerId: string | null): VisualSeatProjection {
  const logical = [...players];
  const localIndex = logical.findIndex((player) => player.playerId === viewerPlayerId && player.role === "player");
  const playerPov = localIndex >= 0;
  const ordered = playerPov ? [...logical.slice(localIndex), ...logical.slice(0, localIndex)] : logical;
  const step = ordered.length ? 360 / ordered.length : 0;
  return {
    orientation: playerPov ? "player" : "spectator",
    logicalPlayerIds: logical.map((player) => player.playerId),
    seats: ordered.map((player, visualIndex) => {
      const local = playerPov && visualIndex === 0;
      return {
        player,
        visualIndex,
        angle: normalizeAngle(playerPov ? 180 - step * visualIndex : step * visualIndex),
        local,
        position: local ? "front" : "perimeter",
      };
    }),
  };
}
