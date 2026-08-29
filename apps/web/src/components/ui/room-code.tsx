"use client";

import { useState } from "react";
import { GameButton } from "./game-button.tsx";
import { GameIcon } from "../icons/game-icon.tsx";

/** Displays a supplied code only. Does not generate, validate, join, or create rooms. */
export function RoomCode({ code, showLabel = false }: { code: string; showLabel?: boolean }) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopyStatus("COPIED! Room code is ready to share."); }
    catch { setCopyStatus("Could not copy. Select and copy the code manually."); }
  }
  return <div className="room-code"><span className="eyebrow">ROOM CODE</span><div className="room-code__value"><code>{code}</code><GameButton variant="ghost" size={showLabel ? "small" : "icon"} aria-label="Copy room code" onClick={copy}><GameIcon name="copy" />{showLabel && "COPY CODE"}</GameButton></div><span className="room-code__feedback" role="status">{copyStatus}</span></div>;
}
