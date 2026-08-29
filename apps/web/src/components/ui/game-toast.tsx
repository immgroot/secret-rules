"use client";

import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton } from "./game-button.tsx";

export function GameToast({ message, onDismiss, tone = "neutral" }: { message: string | null; onDismiss: () => void; tone?: "neutral" | "success" | "danger" }) {
  return <div className="toast-region" role={tone === "danger" ? "alert" : "status"} aria-live={tone === "danger" ? "assertive" : "polite"} aria-atomic="true">
    {message && <div className={`game-toast game-toast--${tone}`}><GameIcon name={tone === "success" ? "success" : tone === "danger" ? "failure" : "rule"} /><p>{message}</p><GameButton size="icon" variant="ghost" onClick={onDismiss} aria-label="Dismiss notification"><GameIcon name="close" size={18} /></GameButton></div>}
  </div>;
}
