"use client";

import type { ReactNode } from "react";
import { PresentationProvider } from "../preferences/provider.tsx";
import { MultiplayerProvider } from "../multiplayer/provider.tsx";

export function AppProviders({ children }: { children: ReactNode }) {
  return <PresentationProvider><MultiplayerProvider>{children}</MultiplayerProvider></PresentationProvider>;
}
