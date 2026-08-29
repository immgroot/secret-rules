"use client";

import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { useState } from "react";
import { ERROR_MESSAGES, MAX_SPECTATORS, RoomCodeSchema } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { usePreferences } from "../../preferences/provider.tsx";
import { FullLogo } from "../brand/logo.tsx";
import { SettingsPanel } from "../home/settings-panel.tsx";
import { GameIcon } from "../icons/game-icon.tsx";
import { ConnectionIndicator, GameButton, GameModal, RoomCode, StatusBadge } from "../ui/index.ts";
import { PlayerList } from "./player-list.tsx";
import { RoomSettingsPanel } from "./room-settings.tsx";
import { ChatPanel } from "./chat-panel.tsx";
import { GameShell } from "../game/game-shell.tsx";

export function LobbyPage({ code }: { code: string }) {
  const { room, playerId, connection, pending, error, resumeRoomCode, initialized, storageAvailable, client } = useMultiplayer();
  const { reducedMotion } = usePreferences();
  const router = useRouter();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const normalized = RoomCodeSchema.safeParse(code);
  const matching = normalized.success && room?.roomCode === normalized.data;
  const active = connection === "connected";
  const me = room?.players.find((player) => player.playerId === playerId);
  const players = room?.players.filter((player) => player.role === "player") ?? [];
  const spectators = room?.players.filter((player) => player.role === "spectator") ?? [];
  const removed = error?.code === "PLAYER_REMOVED";
  async function copyLink() {
    if (!room) return;
    try { await navigator.clipboard.writeText(new URL(`/join/${room.roomCode}`, window.location.origin).href); setCopyMessage("COPIED! Invite your questionable company."); }
    catch { setCopyMessage("Could not copy. Open the invite link and copy its address."); }
  }
  async function leave() { if (await client.leave()) router.push("/"); setLeaving(false); }

  if (matching && room?.status === "in_game" && room.publicRound) return <GameShell />;

  return <div className="site-frame lobby-shell" data-reduce-motion={reducedMotion}>
    <a className="skip-link" href="#lobby-main">Skip to lobby</a>
    <header className="site-header content-width"><Link className="brand-link" href="/" aria-label="SECRET RULES home"><FullLogo /></Link><nav aria-label="Lobby navigation"><ConnectionIndicator status={active ? "connected" : connection === "connecting" || connection === "reconnecting" ? "reconnecting" : "disconnected"} /><GameButton variant="ghost" size="icon" aria-label="Open settings" onClick={() => setPreferencesOpen(true)}><GameIcon name="settings" /></GameButton></nav></header>
    <main className="content-width" id="lobby-main" tabIndex={-1}>
      {matching && room ? <>
        <section className="lobby-heading"><div><p className="eyebrow">SAME ROOM. QUESTIONABLE COMPANY.</p><h1>{room.roomName}</h1><p>Your seats are saved. Your friendships? We’ll see.</p><div className="lobby-access-status"><StatusBadge icon={room.visibility === "private" ? "secret" : "players"}>{room.visibility.toUpperCase()}</StatusBadge><StatusBadge tone={room.locked ? "warning" : "neutral"}>{room.locked ? "LOCKED" : "UNLOCKED"}</StatusBadge><StatusBadge icon="secret">PASSWORD {room.passwordRequired ? "ON" : "OFF"}</StatusBadge></div></div><div className="lobby-invite"><RoomCode code={room.roomCode} showLabel /><div className="lobby-share"><GameButton variant="ghost" size="small" onClick={copyLink}><GameIcon name="copy" size={15} /> COPY INVITE LINK</GameButton><Link href={`/join/${room.roomCode}`} target="_blank" rel="noopener noreferrer">OPEN INVITE <GameIcon name="diagonal" size={13} /></Link></div><span className="lobby-copy-feedback" role="status">{copyMessage}</span></div></section>
        <div className="lobby-layout"><div className="lobby-main-column"><section className="lobby-roster" aria-labelledby="players-heading"><div className="lobby-roster__heading"><h2 id="players-heading">PLAYERS <span>{players.length} / {room.settings.maxPlayers}</span></h2><span className="eyebrow">{players.filter((player) => player.connected).length} CONNECTED</span></div><PlayerList players={players} label="Players in this room" />
          {players.length < 4 && <div className="lobby-open-seat"><GameIcon name="players" size={22} /><div><strong>BETTER WITH YOUR FRIENDS.</strong><p>Gather at least four players. Share the room code to fill the seats.</p></div></div>}
          {spectators.length > 0 && <div className="lobby-spectators"><div className="lobby-roster__heading"><h2>SPECTATORS <span>{spectators.length} / {MAX_SPECTATORS}</span></h2><span className="eyebrow">PUBLIC STATE ONLY</span></div><PlayerList players={spectators} label="Spectators in this room" /></div>}
          <div className="lobby-ready-controls">{me?.role === "spectator" ? <><StatusBadge icon="players">YOU’RE SPECTATING</StatusBadge><p>You can chat and observe. Spectators never receive active-player private state.</p></> : <><GameButton disabled={pending || !active || !me} variant={me?.ready ? "secondary" : "primary"} onClick={() => void client.setReady(!me?.ready)}><GameIcon name="ready" />{pending ? "UPDATING…" : me?.ready ? "NOT READY" : "I’M READY"}</GameButton><p>{me?.ready ? "You’re ready. Let the others catch up." : "Get comfortable. Ready up when you are."}</p></>}</div>
          {!storageAvailable && <p className="lobby-storage-warning">Storage is unavailable. Keep this tab open: a refresh may lose your spot.</p>}
          <div className="lobby-error" role="alert">{error && <><GameIcon name="warning" size={18} /><span>{ERROR_MESSAGES[error.code]}</span></>}</div>
          <div className="lobby-room-tools"><GameButton variant="ghost" size="small" disabled={pending || !active} onClick={() => void client.requestState()}><GameIcon name="reconnect" size={16} /> RESYNC</GameButton><GameButton variant="ghost" size="small" disabled={pending || !active} onClick={() => setLeaving(true)}><GameIcon name="leave" size={16} /> LEAVE ROOM</GameButton><span className="eyebrow">STATE {room.stateVersion}</span></div>
        </section><ChatPanel /></div><RoomSettingsPanel /></div>
      </> : <section className="lobby-empty"><p className="eyebrow">YOUR SEAT AT THE TABLE</p><h1>{removed ? "YOU WERE REMOVED FROM THE ROOM" : !initialized || connection === "reconnecting" ? "FINDING YOUR SPOT…" : "LET’S GET YOU IN."}</h1><p role="status">{error ? ERROR_MESSAGES[error.code] : resumeRoomCode ? "Restoring your saved room session." : "You’ll need a name and a room code. No account required."}</p>{removed ? <Link className="game-button game-button--primary" href="/">RETURN HOME</Link> : resumeRoomCode && normalized.success && resumeRoomCode !== normalized.data ? <Link className="game-button game-button--primary" href={`/room/${resumeRoomCode}`}>RETURN TO {resumeRoomCode}</Link> : !resumeRoomCode && initialized && <Link className="game-button game-button--primary" href={normalized.success ? `/join/${normalized.data}` : "/"}>{normalized.success ? "JOIN THIS ROOM" : "BACK HOME"}</Link>}</section>}
    </main>
    <footer className="lobby-footer content-width"><span>THE BUTTON / 03</span><span>Ready up. The host starts when the table is set.</span></footer>
    {connection === "reconnecting" && <aside className="reconnect-overlay" role="status"><GameIcon name="reconnect" size={24} /><div><strong>CONNECTION LOST</strong><p>RECONNECTING… Your spot is held for a short time.</p></div><GameButton variant="secondary" size="small" disabled={pending} onClick={client.retry}>TRY AGAIN</GameButton></aside>}
    {preferencesOpen && <SettingsPanel connectionStatus={active ? "connected" : "reconnecting"} onClose={() => setPreferencesOpen(false)} />}
    {leaving && <GameModal open title="LEAVE YOUR SPOT?" description="You’ll leave immediately. Coming back means joining as a new player." onClose={() => { if (!pending) setLeaving(false); }}><div className="leave-actions"><GameButton variant="secondary" disabled={pending} onClick={() => setLeaving(false)}>STAY HERE</GameButton><GameButton variant="danger" disabled={pending} onClick={() => void leave()}>LEAVE ROOM</GameButton></div></GameModal>}
  </div>;
}
