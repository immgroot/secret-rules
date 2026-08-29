import type { PrivatePlayerRoundState, PublicRoomSnapshot, ServerError } from "@secret-rules/shared";

export type LobbySnapshot = {
  connection: "idle" | "connecting" | "connected" | "reconnecting" | "ended";
  room: PublicRoomSnapshot | null;
  privateRound: PrivatePlayerRoundState | null;
  playerId: string | null;
  resumeRoomCode: string | null;
  pending: boolean;
  error: ServerError | null;
  storageAvailable: boolean;
  initialized: boolean;
  mutedPlayerIds: string[];
};
export const INITIAL_LOBBY: LobbySnapshot = Object.freeze({
  connection: "idle", room: null, privateRound: null, playerId: null, resumeRoomCode: null,
  pending: false, error: null, storageAvailable: true, initialized: false,
  mutedPlayerIds: [],
});

/** A snapshot never changes membership context or overwrites a newer revision. */
export function newerSnapshot(current: PublicRoomSnapshot | null, incoming: PublicRoomSnapshot, roomId: string, playerId: string) {
  if (incoming.roomId !== roomId || !incoming.players.some((player) => player.playerId === playerId)) return current;
  if (current && (current.roomId !== incoming.roomId || incoming.stateVersion <= current.stateVersion)) return current;
  return incoming;
}
