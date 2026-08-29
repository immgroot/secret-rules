"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPreferenceStore, DEFAULT_PREFERENCES, isMotionReduced, PREFERENCES_KEY } from "./store.ts";
import { createSoundController, createSynthOutput, silentOutput } from "../audio/sounds.ts";

const silentController = createSoundController(() => DEFAULT_PREFERENCES, silentOutput);
const PreferencesContext = createContext<ReturnType<typeof createPreferenceStore> | null>(null);
const SoundContext = createContext(silentController);

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const readDeviceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotion = () => false;

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPreferenceStore);
  const [sound] = useState(() => createSoundController(() => store.getSnapshot().preferences, createSynthOutput()));
  useEffect(() => {
    function hydrate() {
      try { store.hydrate(window.localStorage); } catch { store.hydrate(null); }
    }
    function storageChanged(event: StorageEvent) { if (event.key === PREFERENCES_KEY || event.key === null) hydrate(); }
    function visibilityChanged() { if (document.hidden) sound.stop(); }
    hydrate();
    // Preference changes (including muting) stop currently playing tones immediately.
    const unsubscribe = store.subscribe(sound.stop);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      sound.dispose();
    };
  }, [store, sound]);
  return <PreferencesContext value={store}><SoundContext value={sound}>{children}</SoundContext></PreferencesContext>;
}

export function usePreferences() {
  const store = useContext(PreferencesContext);
  if (!store) throw new Error("Presentation preferences require PresentationProvider.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const deviceReduced = useSyncExternalStore(subscribeMotion, readDeviceMotion, serverMotion);
  return { ...snapshot, update: store.update, deviceReduced, reducedMotion: isMotionReduced(snapshot.preferences.motion, deviceReduced) };
}

export function useSound() { return useContext(SoundContext); }
