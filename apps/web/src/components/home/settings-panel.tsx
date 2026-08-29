"use client";

import { usePreferences, useSound } from "../../preferences/provider.tsx";
import { ConnectionIndicator, GameButton, GameModal } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";

export function SettingsPanel({ onClose, connectionStatus = "preview" }: { onClose: () => void; connectionStatus?: "preview" | "connected" | "reconnecting" | "disconnected" }) {
  const { preferences, persistence, update, deviceReduced } = usePreferences();
  const sound = useSound();
  return <GameModal open onClose={onClose} title="SETTLE IN." description="Your volume. Your pace. These preferences only affect presentation." className="settings-panel">
    <fieldset className="preference-group">
      <legend>MASTER SOUND</legend>
      <label className="preference-toggle"><span>Enable sound<small>Quiet placeholder tones. Off until you opt in.</small></span><input type="checkbox" checked={preferences.masterEnabled} onChange={(event) => { update({ masterEnabled: event.target.checked }); sound.unlock(); sound.play("uiClick"); }} /></label>
      <label className="volume-control"><span>Master volume <output>{Math.round(preferences.masterVolume * 100)}%</output></span><input type="range" min="0" max="100" step="5" aria-label="Master volume" value={Math.round(preferences.masterVolume * 100)} onInput={(event) => update({ masterVolume: Number(event.currentTarget.value) / 100 })} /></label>
    </fieldset>
    <fieldset className="preference-group">
      <legend>UI SOUND</legend>
      <label className="preference-toggle"><span>Interface sounds<small>Clicks, card movement, and hover feedback.</small></span><input type="checkbox" checked={preferences.uiEnabled} onChange={(event) => update({ uiEnabled: event.target.checked })} /></label>
      <label className="volume-control"><span>UI volume <output>{Math.round(preferences.uiVolume * 100)}%</output></span><input type="range" min="0" max="100" step="5" aria-label="UI volume" value={Math.round(preferences.uiVolume * 100)} onInput={(event) => update({ uiVolume: Number(event.currentTarget.value) / 100 })} /></label>
    </fieldset>
    <fieldset className="preference-group">
      <legend>MOTION</legend>
      <div className="motion-options">{(["full", "reduced"] as const).map((motion) => <label key={motion}><input type="radio" name="motion" value={motion} checked={preferences.motion === motion} onChange={() => update({ motion })} /><span>{motion.toUpperCase()}</span></label>)}</div>
      <p className="settings-note">{deviceReduced ? "Your device requests reduced motion, so movement stays reduced even with Full selected." : "Reduced keeps the story and controls, without animated movement."}</p>
    </fieldset>
    <div className="sound-test"><GameButton variant="secondary" size="small" disabled={!preferences.masterEnabled || preferences.masterVolume === 0} onClick={() => sound.play("buttonPress")}><GameIcon name="audio" size={16} /> TEST SOUND</GameButton><span>{preferences.masterEnabled && preferences.masterVolume > 0 ? "Sound enabled" : "Master sound muted"}</span></div>
    <p className="settings-note" role="status">{persistence === "unavailable" ? "Browser storage is unavailable. Changes work for this visit only." : persistence === "loading" ? "Loading your preferences…" : "Preferences save in this browser. No account needed."}</p>
    <div className="settings-connection"><ConnectionIndicator status={connectionStatus} /></div>
    <GameButton className="modal-done" onClick={onClose}>LOOKS GOOD<GameIcon name="success" size={18} /></GameButton>
  </GameModal>;
}
