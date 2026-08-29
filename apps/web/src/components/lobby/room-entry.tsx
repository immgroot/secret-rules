"use client";

import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { useState, type FormEvent } from "react";
import { AVATAR_IDS, AVATAR_LABELS, ERROR_MESSAGES, type AvatarId, type PlayerRole } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { usePreferences } from "../../preferences/provider.tsx";
import { FullLogo } from "../brand/logo.tsx";
import { GameButton, GameCard, GameModal, PlayerBadge } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";

function EntryForm({ mode, initialCode = "" }: { mode: "create" | "join"; initialCode?: string }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [avatarId, setAvatar] = useState<AvatarId>("lime");
  const [roomName, setRoomName] = useState("");
  const [role, setRole] = useState<PlayerRole>("player");
  const [password, setPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { client, pending, error, resumeRoomCode, initialized, storageAvailable } = useMultiplayer();
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const room = await client.enter(mode, { displayName: name, avatarId, ...(mode === "join" ? { roomCode: code, role, ...(password ? { password } : {}) } : { roomName }) });
    if (room) router.push(`/room/${room.roomCode}`);
  }
  if (resumeRoomCode) return <div className="entry-existing"><p>You already have a spot in <strong>{resumeRoomCode}</strong>.</p><Link className="game-button game-button--primary" href={`/room/${resumeRoomCode}`}>RETURN TO YOUR ROOM <GameIcon name="arrow" /></Link><p className="settings-note">Leave that room first if you want to start somewhere else.</p></div>;
  return <form className="room-entry-form" onSubmit={submit}>
    {mode === "join" && <label className="lobby-field">ROOM CODE<input className="code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="K7F2Q" required aria-describedby="entry-code-help" /><span id="entry-code-help">Five characters. One very questionable plan.</span></label>}
    {mode === "join" && <div className="entry-password">{passwordOpen || error?.code === "PASSWORD_REQUIRED" || error?.code === "INCORRECT_PASSWORD" ? <label className="lobby-field">ROOM PASSWORD<input type="password" autoComplete="off" value={password} maxLength={64} onChange={(event) => setPassword(event.target.value)} /><span>Ask the host. Passwords never go in invite links.</span></label> : <GameButton variant="ghost" size="small" onClick={() => setPasswordOpen(true)}>HAVE A ROOM PASSWORD?</GameButton>}</div>}
    <label className="lobby-field">YOUR NAME<input autoComplete="nickname" autoCapitalize="words" spellCheck={false} maxLength={20} minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" required aria-describedby="entry-name-help" /><span id="entry-name-help">2–20 characters. Names must be unique in this room.</span></label>
    <fieldset className="avatar-picker"><legend>PICK YOUR LOOK</legend><div>{AVATAR_IDS.map((avatar) => <label key={avatar} className="avatar-choice"><input type="radio" name="avatar" value={avatar} checked={avatarId === avatar} onChange={() => setAvatar(avatar)} aria-label={`${AVATAR_LABELS[avatar]} avatar`} /><span><PlayerBadge name="" tone={avatar} avatarId={avatar} compact /><span className="avatar-choice__name">{AVATAR_LABELS[avatar]}</span><GameIcon name="ready" size={14} /></span></label>)}</div><p className="settings-note">Your room color is assigned by the server.</p></fieldset>
    {mode === "create" ? <label className="lobby-field">ROOM NAME · OPTIONAL<input value={roomName} maxLength={40} minLength={2} onChange={(event) => setRoomName(event.target.value)} placeholder="SECRET ROOM" /></label> : <fieldset className="role-picker"><legend>YOUR SEAT</legend><label><input type="radio" name="role" checked={role === "player"} onChange={() => setRole("player")} /> PLAY</label><label><input type="radio" name="role" checked={role === "spectator"} onChange={() => setRole("spectator")} /> SPECTATE</label></fieldset>}
    <div className="lobby-error" role="alert">{error && <><GameIcon name="warning" size={18} /><span>{ERROR_MESSAGES[error.code]}</span></>}</div>
    {!storageAvailable && <p className="settings-note">Browser storage is unavailable. Keep this tab open; refreshing may lose your spot.</p>}
    <GameButton type="submit" disabled={pending || !initialized} className="entry-submit">{pending ? "ONE MOMENT…" : mode === "create" ? "CREATE ROOM" : "JOIN ROOM"}<GameIcon name="arrow" /></GameButton>
    <p className="entry-note"><GameIcon name="players" size={15} /> 4–10 friends. No accounts. The Button is live.</p>
  </form>;
}

export function RoomEntryModal({ mode, onClose }: { mode: "create" | "join"; onClose: () => void }) {
  const { pending } = useMultiplayer();
  return <GameModal open title={mode === "create" ? "MAKE SOME TROUBLE." : "JOIN A ROOM."} description={mode === "create" ? "Get a code. Gather your friends. We’ll save you the host seat." : "Your friends are waiting. Bring the code, leave your trust at the door."} className="room-entry-modal" onClose={() => { if (!pending) onClose(); }}><EntryForm mode={mode} /></GameModal>;
}

export function JoinRoomPage({ code }: { code: string }) {
  const { reducedMotion } = usePreferences();
  return <div className="site-frame lobby-shell" data-reduce-motion={reducedMotion}><header className="site-header content-width"><Link className="brand-link" href="/" aria-label="SECRET RULES home"><FullLogo /></Link><Link className="lobby-back" href="/">BACK HOME <GameIcon name="arrow" size={16} /></Link></header><main className="join-page content-width"><GameCard><p className="eyebrow">YOU’RE INVITED</p><h1>JOIN A ROOM.</h1><p>Your friends have a plan. Probably.</p><EntryForm mode="join" initialCode={code} /></GameCard></main></div>;
}
