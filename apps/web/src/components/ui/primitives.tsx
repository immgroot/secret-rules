import type { HTMLAttributes, ReactNode } from "react";
import type { AvatarId, PlayerColor } from "@secret-rules/shared";
import { GameIcon, type IconName } from "../icons/game-icon.tsx";
import { formatRemainingTime } from "./presentation.ts";

export type PlayerTone = PlayerColor | "spectator";
export type StatusTone = "neutral" | "success" | "warning" | "danger";
export type PlayerReaction = "idle" | "press" | "surprised" | "suspicious";

export function GameCard({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`game-card ${className}`} {...props}>{children}</div>;
}

export function SectionTitle({ eyebrow, children, id }: { eyebrow: string; children: ReactNode; id?: string }) {
  return <div className="section-title"><p className="eyebrow">{eyebrow}</p><h2 id={id}>{children}</h2></div>;
}

export function PlayerBadge({ name, tone = "lime", avatarId, host = false, ready = false, compact = false, reaction = "idle" }: { name: string; tone?: PlayerTone; avatarId?: AvatarId; host?: boolean; ready?: boolean; compact?: boolean; reaction?: PlayerReaction }) {
  return <span className={`player-badge player-badge--${tone}${compact ? " player-badge--compact" : ""}`} data-reaction={reaction}>
    <span className="player-avatar" data-avatar={avatarId} aria-hidden="true"><span className="avatar-eyes"><i /><i /></span></span>
    <span className="player-badge__name">{name}</span>
    {host && <GameIcon name="host" size={14} label="Host" />}
    {ready && <GameIcon name="ready" size={14} label="Ready" />}
  </span>;
}

const statusIcons: Record<StatusTone, IconName> = { neutral: "rule", success: "success", warning: "warning", danger: "failure" };
export function StatusBadge({ tone = "neutral", children, icon }: { tone?: StatusTone; children: ReactNode; icon?: IconName }) {
  return <span className={`status-badge status-badge--${tone}`}><GameIcon name={icon ?? statusIcons[tone]} size={14} />{children}</span>;
}

export function GameTimer({ endTime, serverTime, label = "Time remaining" }: { endTime: number | null; serverTime: number | null; label?: string }) {
  const display = formatRemainingTime(endTime, serverTime);
  return <span className="game-timer" role="timer" aria-label={`${label}: ${display}`}><GameIcon name="timer" size={16} /><span>{display}</span></span>;
}

export function ScoreBadge({ score, label = "Score" }: { score: number; label?: string }) {
  const display = Number.isFinite(score) ? String(score) : "—";
  return <span className="score-badge" aria-label={`${label}: ${display}`}><GameIcon name="score" size={16} /><span key={display} className="score-badge__value">{display}</span><span className="sr-only"> {label}</span></span>;
}

const connections = {
  connected: { label: "Connected", icon: "connection", tone: "success" },
  reconnecting: { label: "Reconnecting", icon: "reconnect", tone: "warning" },
  disconnected: { label: "Disconnected", icon: "failure", tone: "danger" },
  preview: { label: "Preview · not connected", icon: "connection", tone: "neutral" },
} as const;

export function ConnectionIndicator({ status }: { status: keyof typeof connections }) {
  const { label, icon, tone } = connections[status];
  return <span role="status" aria-live="polite"><StatusBadge tone={tone} icon={icon}>{label}</StatusBadge></span>;
}
