"use client";

import { useState } from "react";
import { AVATAR_IDS, AVATAR_LABELS, AvatarIdSchema, BUTTON_ROUND_DURATION_PRESETS, CHAOS_DESCRIPTIONS, CHAOS_LEVELS, COLOR_LABELS, EVENTS, MAX_BUTTON_ROUND_DURATION_SECONDS, MIN_BUTTON_ROUND_DURATION_SECONDS, PLAYER_COLORS, PlayerColorSchema, PlayerRoleSchema, ROUND_COUNTS, RoomSettingsSchema, VisibilitySchema, type RoomSettings } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { GameButton, GameCard, PlayerBadge } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";

function NameEditor({ name, disabled }: { name: string; disabled: boolean }) {
  const { client } = useMultiplayer();
  const [draft, setDraft] = useState(name);
  return <form className="room-name-form" onSubmit={(event) => { event.preventDefault(); void client.send(EVENTS.name, { roomName: draft }); }}><label className="lobby-field">ROOM NAME<input value={draft} maxLength={40} minLength={2} required disabled={disabled} onChange={(event) => setDraft(event.target.value)} /></label><GameButton type="submit" variant="secondary" size="small" disabled={disabled || draft === name}>SAVE NAME</GameButton></form>;
}
function PasswordEditor({ enabled, disabled }: { enabled: boolean; disabled: boolean }) {
  const { client } = useMultiplayer();
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  async function save() { if (await client.send(EVENTS.password, { enabled: true, password })) { setPassword(""); setEditing(false); } }
  return <div className="password-editor"><div className="room-setting-line"><span>ROOM PASSWORD <strong>{enabled ? "ON" : "OFF"}</strong></span><GameButton variant="ghost" size="small" disabled={disabled} onClick={() => setEditing(!editing)}>{editing ? "CANCEL" : enabled ? "CHANGE" : "ENABLE"}</GameButton></div>
    {editing && <form onSubmit={(event) => { event.preventDefault(); void save(); }}><label className="lobby-field">NEW ROOM PASSWORD<input type="password" autoComplete="new-password" minLength={8} maxLength={64} required value={password} disabled={disabled} onChange={(event) => setPassword(event.target.value)} /><span>8–64 characters. Share it separately from the invite.</span></label><GameButton type="submit" size="small" variant="secondary" disabled={disabled}>SET PASSWORD</GameButton></form>}
    {enabled && <GameButton variant="ghost" size="small" disabled={disabled} onClick={async () => { if (await client.send(EVENTS.password, { enabled: false })) { setPassword(""); setEditing(false); } }}>TURN PASSWORD OFF</GameButton>}
  </div>;
}

function RoundTimeEditor({ value, disabled, change }: { value: number; disabled: boolean; change: (seconds: number) => void }) {
  const preset = BUTTON_ROUND_DURATION_PRESETS.some((seconds) => seconds === value);
  const [customOpen, setCustomOpen] = useState(!preset);
  const [customValue, setCustomValue] = useState(String(value));
  function applyCustom() {
    const seconds = Number(customValue);
    if (Number.isInteger(seconds) && seconds >= MIN_BUTTON_ROUND_DURATION_SECONDS && seconds <= MAX_BUTTON_ROUND_DURATION_SECONDS) change(seconds);
  }
  return <div className="round-time-setting"><span className="round-time-setting__label">ROUND TIME</span>
    <div className="round-time-presets" role="group" aria-label="Button round duration">
      {BUTTON_ROUND_DURATION_PRESETS.map((seconds) => <button type="button" key={seconds} aria-pressed={value === seconds && !customOpen} disabled={disabled} onClick={() => { setCustomOpen(false); setCustomValue(String(seconds)); change(seconds); }}>{seconds} SEC</button>)}
      <button type="button" aria-pressed={customOpen} disabled={disabled} onClick={() => setCustomOpen(true)}>CUSTOM</button>
    </div>
    {customOpen && <form className="round-time-custom" onSubmit={(event) => { event.preventDefault(); applyCustom(); }}>
      <label><span className="sr-only">Custom round duration in seconds</span><input type="number" inputMode="numeric" min={MIN_BUTTON_ROUND_DURATION_SECONDS} max={MAX_BUTTON_ROUND_DURATION_SECONDS} step={1} required disabled={disabled} value={customValue} onChange={(event) => setCustomValue(event.target.value)} /></label>
      <GameButton type="submit" variant="secondary" size="small" disabled={disabled || Number(customValue) === value}>APPLY</GameButton>
    </form>}
    <span className="round-time-setting__help">{value} seconds per round · locked once the match starts · custom {MIN_BUTTON_ROUND_DURATION_SECONDS}–{MAX_BUTTON_ROUND_DURATION_SECONDS}</span>
  </div>;
}

export function RoomSettingsPanel() {
  const { room, playerId, client, pending, connection } = useMultiplayer();
  if (!room) return null;
  const me = room.players.find((player) => player.playerId === playerId);
  if (!me) return null;
  const host = room.hostPlayerId === playerId;
  const actionDisabled = pending || connection !== "connected";
  const disabled = actionDisabled || room.status !== "lobby";
  const activePlayers = room.players.filter((player) => player.role === "player");
  const canPrepare = activePlayers.length >= 4 && activePlayers.length <= 10 && activePlayers.every((player) => player.connected && player.ready);
  function setting(key: keyof RoomSettings, value: string | number) {
    const result = RoomSettingsSchema.safeParse({ ...room?.settings, [key]: value });
    if (result.success) void client.updateSettings(result.data);
  }
  return <GameCard className="lobby-settings"><div className="lobby-section-heading"><GameIcon name="settings" size={18} /><h2>SET THE MOOD.</h2></div><p>{host ? "Your room. Your questionable plan." : "The host sets the room. You bring the trouble."}</p>
    <details className="lobby-settings-group" open><summary>ROOM <span>{host ? "HOST CONTROLS" : "HOST CONTROLLED"}</span></summary><div>
      {host ? <NameEditor key={room.roomName} name={room.roomName} disabled={disabled} /> : <div className="room-setting-readonly"><span>ROOM NAME</span><strong>{room.roomName}</strong></div>}
      <fieldset disabled={disabled || !host}><legend className="sr-only">Room access, controlled by the host</legend><label className="lobby-field">VISIBILITY<select value={room.visibility} onChange={(event) => void client.send(EVENTS.visibility, { visibility: VisibilitySchema.parse(event.target.value) })}><option value="private">PRIVATE</option><option value="public">PUBLIC</option></select><span>{room.visibility === "private" ? "Unlisted. Join by code or invite." : "Eligible for future discovery. No room browser yet."}</span></label>
        <label className="lobby-field">LOCK ROOM<select value={room.locked ? "locked" : "unlocked"} onChange={(event) => void client.send(EVENTS.lock, { locked: event.target.value === "locked" })}><option value="unlocked">UNLOCKED</option><option value="locked">LOCKED</option></select><span>Blocks new joins. Saved players can still reconnect.</span></label>
      </fieldset>{host ? <PasswordEditor enabled={room.passwordRequired} disabled={disabled} /> : <div className="room-setting-line"><span>ROOM PASSWORD <strong>{room.passwordRequired ? "ON" : "OFF"}</strong></span></div>}
    </div></details>
    <details className="lobby-settings-group"><summary>GAME <span>THE PLAN</span></summary><div><fieldset disabled={disabled || !host}><legend className="sr-only">Game settings, controlled by the host</legend>
      <label className="lobby-field">MAX PLAYERS<select value={room.settings.maxPlayers} onChange={(event) => setting("maxPlayers", Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => i + 4).map((count) => <option key={count} value={count}>{count} PLAYERS</option>)}</select></label>
      <label className="lobby-field">ROUND COUNT<select value={room.settings.roundCount} onChange={(event) => setting("roundCount", Number(event.target.value))}>{ROUND_COUNTS.map((count) => <option key={count} value={count}>{count} ROUNDS</option>)}</select></label>
      <RoundTimeEditor value={room.settings.buttonRoundDurationSeconds} disabled={disabled || !host} change={(seconds) => setting("buttonRoundDurationSeconds", seconds)} />
      <label className="lobby-field">CHAOS<select value={room.settings.chaos} onChange={(event) => setting("chaos", event.target.value)}>{CHAOS_LEVELS.map((chaos) => <option key={chaos} value={chaos}>{chaos.toUpperCase()}</option>)}</select><span>{CHAOS_DESCRIPTIONS[room.settings.chaos]}</span></label>
    </fieldset><p className="settings-note">Chaos now shapes rule categories, conflicts, rarity, and relationship density.</p></div></details>
    <details className="lobby-settings-group"><summary>PLAYER <span>YOUR LOOK</span></summary><div><div className="settings-player-preview"><PlayerBadge name={me.displayName} tone={me.playerColor ?? "spectator"} avatarId={me.avatarId} /></div><fieldset disabled={disabled}><legend className="sr-only">Your player settings</legend>
      <label className="lobby-field">AVATAR<select value={me.avatarId} onChange={(event) => void client.send(EVENTS.avatar, { avatarId: AvatarIdSchema.parse(event.target.value) })}>{AVATAR_IDS.map((id) => <option key={id} value={id}>{AVATAR_LABELS[id]}</option>)}</select></label>
      {me.role === "player" && <label className="lobby-field">PLAYER COLOR<select value={me.playerColor ?? "lime"} onChange={(event) => void client.send(EVENTS.color, { playerColor: PlayerColorSchema.parse(event.target.value) })}>{PLAYER_COLORS.map((color) => { const taken = room.players.some((player) => player.playerId !== me.playerId && player.playerColor === color); return <option key={color} value={color} disabled={taken}>{COLOR_LABELS[color]}{taken ? " · TAKEN" : ""}</option>; })}</select><span>One color per player. Your color stays reserved on reconnect.</span></label>}
      <GameButton className="randomize-avatar" variant="secondary" size="small" onClick={() => void client.send(EVENTS.randomize, {})}>RANDOMIZE AVATAR</GameButton>
      <label className="lobby-field">YOUR ROLE<select disabled={host} value={me.role} onChange={(event) => void client.send(EVENTS.role, { role: PlayerRoleSchema.parse(event.target.value) })}><option value="player">PLAY</option><option value="spectator">SPECTATE</option></select><span>{host ? "Transfer host to a connected player before spectating." : "Spectators have separate seats and public state only. Switching resets ready."}</span></label>
    </fieldset></div></details>
    <div className="lobby-next-phase"><GameIcon name="secret" size={18} /><span>{canPrepare ? "Everyone is ready. Start when you are." : "Four connected players must all be ready."}</span></div>
    {host && <GameButton disabled={actionDisabled || !canPrepare} className="start-game" onClick={() => void client.startGame()}>START GAME <GameIcon name="arrow" size={16} /></GameButton>}
    <p className="lobby-phase-note">THE BUTTON · SERVER-AUTHORITATIVE ROUND</p>
  </GameCard>;
}
