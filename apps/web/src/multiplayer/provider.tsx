"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LobbyClient } from "./client.ts";

const MultiplayerContext = createContext<LobbyClient | null>(null);
export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new LobbyClient());
  useEffect(() => client.mount(), [client]);
  return <MultiplayerContext value={client}>{children}</MultiplayerContext>;
}
export function useMultiplayer() {
  const client = useContext(MultiplayerContext);
  if (!client) throw new Error("Lobby controls require MultiplayerProvider.");
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getServerSnapshot);
  return { ...snapshot, client };
}
