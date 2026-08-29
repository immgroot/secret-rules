import type { Preferences } from "../preferences/store.ts";

// Original synthesized placeholders. Replace this output adapter with licensed
// local assets later; callers keep these stable, presentation-only event names.
export const soundEvents = {
  uiHover: { channel: "ui", frequency: 500, end: 550, duration: 0.025 },
  uiClick: { channel: "ui", frequency: 280, end: 190, duration: 0.045 },
  cardFlip: { channel: "ui", frequency: 680, end: 260, duration: 0.09 },
  cardSlide: { channel: "ui", frequency: 370, end: 260, duration: 0.055 },
  buttonPress: { channel: "demo", frequency: 110, end: 65, duration: 0.11 },
  counterTick: { channel: "demo", frequency: 540, end: 660, duration: 0.065 },
  unexpectedCounter: { channel: "demo", frequency: 380, end: 130, duration: 0.22 },
  secretReveal: { channel: "demo", frequency: 420, end: 840, duration: 0.19 },
  success: { channel: "demo", frequency: 520, end: 1040, duration: 0.2 },
  failure: { channel: "demo", frequency: 230, end: 95, duration: 0.18 },
  pointsEarned: { channel: "demo", frequency: 480, end: 760, duration: 0.13 },
  standingsReveal: { channel: "demo", frequency: 350, end: 620, duration: 0.18 },
  winnerReveal: { channel: "demo", frequency: 620, end: 1240, duration: 0.28 },
  matchComplete: { channel: "demo", frequency: 410, end: 820, duration: 0.24 },
} as const;
export type SoundEvent = keyof typeof soundEvents;
export type SoundOutput = { unlock: () => void; play: (event: SoundEvent, gain: number) => void; stop: () => void; dispose: () => void };
export const silentOutput: SoundOutput = { unlock() {}, play() {}, stop() {}, dispose() {} };

export function soundGain(event: SoundEvent, preferences: Readonly<Preferences>): number {
  if (!preferences.masterEnabled) return 0;
  if (soundEvents[event].channel === "ui") return preferences.uiEnabled ? preferences.masterVolume * preferences.uiVolume : 0;
  return preferences.masterVolume;
}

export function createSoundController(readPreferences: () => Readonly<Preferences>, output: SoundOutput) {
  return {
    unlock() { if (readPreferences().masterEnabled) output.unlock(); },
    play(event: SoundEvent) {
      const gain = soundGain(event, readPreferences());
      if (gain > 0) output.play(event, gain);
    },
    stop: output.stop,
    dispose: output.dispose,
  };
}

/** Lazy Web Audio; never creates/resumes an audio context without user activation. */
export function createSynthOutput(): SoundOutput {
  let context: AudioContext | null = null;
  const voices = new Set<OscillatorNode>();
  let lastHover = -Infinity;
  function unlock() {
    if (typeof window === "undefined" || !navigator.userActivation?.isActive || !window.AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch { /* Unsupported/blocked audio stays silent. */ }
  }
  function stop() {
    for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }
  return {
    unlock,
    play(event, volume) {
      // Hover cannot unlock sound. A click or explicit enable action must do so.
      if (event !== "uiHover") unlock();
      if (!context || context.state !== "running" || document.hidden || voices.size >= 6) return;
      const now = context.currentTime;
      if (event === "uiHover" && now - lastHover < 0.12) return;
      if (event === "uiHover") lastHover = now;
      const sound = soundEvents[event];
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(sound.frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(sound.end, now + sound.duration);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, volume)) * 0.09, now + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration);
      oscillator.connect(envelope).connect(context.destination);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + sound.duration + 0.01);
    },
    stop,
    dispose() {
      stop();
      if (context) void context.close().catch(() => {});
      context = null;
      lastHover = -Infinity;
    },
  };
}
