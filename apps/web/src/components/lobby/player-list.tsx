"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COLOR_LABELS, ERROR_MESSAGES, EVENTS, REPORT_LABELS, REPORT_REASONS, ReportReasonSchema, type PublicPlayer } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { GameButton, GameModal, PlayerBadge, StatusBadge } from "../ui/index.ts";

type Action = "profile" | "report" | "kick" | "transfer";
export function PlayerStatus({ player }: { player: PublicPlayer }) {
  return <>{!player.connected ? <StatusBadge tone="warning" icon="reconnect">RECONNECTING</StatusBadge> : player.afk ? <StatusBadge tone="warning" icon="timer">AFK</StatusBadge> : null}
    {player.role === "spectator" ? <StatusBadge icon="players">SPECTATOR</StatusBadge> : player.ready ? <StatusBadge tone="success" icon="ready">READY</StatusBadge> : <StatusBadge>NOT READY</StatusBadge>}</>;
}

function PlayerMenu({ player, self, host, disabled, choose }: { player: PublicPlayer; self: boolean; host: boolean; disabled: boolean; choose: (action: Action) => void }) {
  const { client, mutedPlayerIds } = useMultiplayer();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const action = (value: Action) => { close(); client.clearError(); choose(value); };
  return <div className="player-menu" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="player-menu__trigger" aria-label={`Actions for ${player.displayName}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>···</button>
    {open && <div className="player-menu__items" id={menuId} role="menu" aria-label={`${player.displayName} actions`} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "Tab") { setOpen(false); return; }
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
      if (next !== null) { event.preventDefault(); items[next]?.focus(); }
    }}>
      <button role="menuitem" onClick={() => action("profile")}>VIEW PROFILE</button>
      {!self && <><button role="menuitem" onClick={() => { client.toggleMute(player.playerId); close(); }}>{mutedPlayerIds.includes(player.playerId) ? "UNMUTE" : "MUTE"} · JUST FOR YOU</button><button role="menuitem" disabled={disabled} onClick={() => action("report")}>REPORT</button></>}
      {!self && host && <>{player.connected && player.role === "player" && <button role="menuitem" disabled={disabled} onClick={() => action("transfer")}>TRANSFER HOST</button>}<button role="menuitem" className="danger-text" disabled={disabled} onClick={() => action("kick")}>REMOVE PLAYER</button></>}
    </div>}
  </div>;
}

function PlayerDialog({ player, action, close }: { player: PublicPlayer; action: Action; close: () => void }) {
  const { client, playerId, pending, connection, error } = useMultiplayer();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("spam");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const disabled = pending || connection !== "connected";
  const title = action === "profile" ? "PLAYER PROFILE" : action === "report" ? submitted ? "REPORT SUBMITTED" : `REPORT ${player.displayName}?` : action === "kick" ? `REMOVE ${player.displayName}?` : `MAKE ${player.displayName} HOST?`;
  async function confirm() {
    const success = action === "report" ? await client.send(EVENTS.report, { targetPlayerId: player.playerId, reason, description }) : action === "kick" ? await client.send(EVENTS.kick, { targetPlayerId: player.playerId }) : await client.send(EVENTS.transfer, { targetPlayerId: player.playerId });
    if (success) { if (action === "report") { setSubmitted(true); setDescription(""); } else close(); }
  }
  return <GameModal open title={title} className="player-dialog" onClose={() => { if (!pending) close(); }}>
    {action === "profile" ? <><div className="profile-identity"><PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} />{playerId === player.playerId && <span className="you-label">YOU</span>}</div>
      <dl className="profile-facts"><div><dt>COLOR</dt><dd>{player.playerColor ? COLOR_LABELS[player.playerColor] : "Spectator · neutral"}</dd></div><div><dt>ROLE</dt><dd>{player.isHost ? "Host · player" : player.role === "player" ? "Player" : "Spectator"}</dd></div><div><dt>CONNECTION</dt><dd>{player.connected ? "Connected" : "Reconnecting"}</dd></div><div><dt>ACTIVITY</dt><dd>{!player.connected ? "Connection lost" : player.afk ? "AFK" : "Active"}</dd></div><div><dt>READY</dt><dd>{player.role === "spectator" ? "Not applicable" : player.ready ? "Ready" : "Not ready"}</dd></div><div><dt>JOINED</dt><dd><time dateTime={new Date(player.joinedAt).toISOString()}>{new Date(player.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></dd></div></dl><p className="settings-note">Match stats come with gameplay. Nothing to compare just yet.</p></> : action === "report" && submitted ? <><p role="status">Your report was accepted privately.</p><p className="settings-note">Reports are held only in this server’s memory for now. Persistent moderation is not available yet.</p><GameButton onClick={close}>DONE</GameButton></> : <>
      <p className="settings-note">{action === "kick" ? "Their spot and reconnect access will be removed. This is not a ban: they can join again as a fresh participant if the room allows it." : action === "transfer" ? "They’ll get room controls immediately. You’ll remain in the room as a player." : "Only the server receives your report. Your identity is not shared with this player. Reports are temporary, not permanently stored."}</p>
      {action === "report" && <><label className="lobby-field">REASON<select value={reason} disabled={disabled} onChange={(event) => setReason(ReportReasonSchema.parse(event.target.value))}>{REPORT_REASONS.map((value) => <option key={value} value={value}>{REPORT_LABELS[value]}</option>)}</select></label><label className="lobby-field">DESCRIPTION · OPTIONAL<textarea rows={3} maxLength={240} value={description} disabled={disabled} onChange={(event) => setDescription(event.target.value)} /><span>{description.length} / 240</span></label></>}
      {error && <p className="lobby-error" role="alert">{ERROR_MESSAGES[error.code]}</p>}
      <div className="leave-actions"><GameButton variant="secondary" disabled={pending} onClick={close}>CANCEL</GameButton><GameButton variant={action === "kick" ? "danger" : "primary"} disabled={disabled} onClick={() => void confirm()}>{pending ? "ONE MOMENT…" : action === "kick" ? "REMOVE" : action === "transfer" ? "TRANSFER" : "SUBMIT REPORT"}</GameButton></div>
    </>}
  </GameModal>;
}

export function PlayerList({ players, label }: { players: PublicPlayer[]; label: string }) {
  const { playerId, room, pending, connection, mutedPlayerIds } = useMultiplayer();
  const [selected, setSelected] = useState<{ id: string; action: Action } | null>(null);
  const [previous, setPrevious] = useState(players);
  const [leaving, setLeaving] = useState<PublicPlayer[]>([]);
  if (previous !== players) {
    setPrevious(players);
    setLeaving(previous.filter((player) => !players.some((current) => current.playerId === player.playerId)));
  }
  useEffect(() => { if (leaving.length) { const timer = setTimeout(() => setLeaving([]), 200); return () => clearTimeout(timer); } }, [leaving]);
  const target = players.find((player) => player.playerId === selected?.id);
  return <><ul className="lobby-players" aria-label={label}>{[...players, ...leaving].map((player) => {
    const exiting = leaving.includes(player);
    return <li key={player.playerId} className="lobby-player" data-ready={player.ready} data-connected={player.connected} data-leaving={exiting} aria-hidden={exiting || undefined} inert={exiting || undefined}>
      <button className="player-profile-trigger" onClick={() => setSelected({ id: player.playerId, action: "profile" })} aria-label={`View ${player.displayName}'s profile`}><PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} /></button>
      <div className="lobby-player__labels">{player.playerId === playerId && <span className="you-label">YOU</span>}{player.isHost ? <StatusBadge icon="host">HOST</StatusBadge> : player.role === "player" && <span className="you-label role-label">PLAYER</span>}{mutedPlayerIds.includes(player.playerId) && <span className="you-label role-label">MUTED FOR YOU</span>}</div>
      <span className="lobby-player__status"><PlayerStatus player={player} /></span>
      {!exiting && <PlayerMenu player={player} self={player.playerId === playerId} host={room?.hostPlayerId === playerId} disabled={pending || connection !== "connected"} choose={(action) => setSelected({ id: player.playerId, action })} />}
    </li>;
  })}</ul>{target && selected && <PlayerDialog key={`${target.playerId}-${selected.action}`} player={target} action={selected.action} close={() => setSelected(null)} />}</>;
}
