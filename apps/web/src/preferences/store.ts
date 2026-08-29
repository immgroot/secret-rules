import { z } from "zod";

export const PREFERENCES_KEY = "secret-rules:preferences:v1";
export const preferencesSchema = z.strictObject({
  version: z.literal(1),
  masterEnabled: z.boolean(),
  masterVolume: z.number().min(0).max(1),
  uiEnabled: z.boolean(),
  uiVolume: z.number().min(0).max(1),
  motion: z.enum(["full", "reduced"]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  version: 1, masterEnabled: false, masterVolume: 0.45,
  uiEnabled: true, uiVolume: 0.5, motion: "full",
});
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function parsePreferences(raw: string | null): Readonly<Preferences> {
  if (!raw || raw.length > 1024) return DEFAULT_PREFERENCES;
  try {
    const result = preferencesSchema.safeParse(JSON.parse(raw));
    return result.success ? Object.freeze(result.data) : DEFAULT_PREFERENCES;
  } catch { return DEFAULT_PREFERENCES; }
}

export function isMotionReduced(preference: Preferences["motion"], deviceReduced: boolean) {
  return deviceReduced || preference === "reduced";
}

const serverSnapshot = { preferences: DEFAULT_PREFERENCES, persistence: "loading" as "loading" | "available" | "unavailable" };

/** Browser presentation preferences only. No identity, room state, or demo progress. */
export function createPreferenceStore() {
  let snapshot = serverSnapshot;
  let storage: PreferenceStorage | null = null;
  const listeners = new Set<() => void>();
  function notify() { for (const listener of listeners) listener(); }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate(nextStorage: PreferenceStorage | null) {
      storage = nextStorage;
      try {
        snapshot = { preferences: parsePreferences(storage?.getItem(PREFERENCES_KEY) ?? null), persistence: storage ? "available" : "unavailable" };
      } catch {
        storage = null;
        snapshot = { preferences: DEFAULT_PREFERENCES, persistence: "unavailable" };
      }
      notify();
    },
    update(patch: Partial<Omit<Preferences, "version">>) {
      const result = preferencesSchema.safeParse({ ...snapshot.preferences, ...patch });
      if (!result.success) return false;
      let persistence: typeof snapshot.persistence = "unavailable";
      try {
        if (storage) { storage.setItem(PREFERENCES_KEY, JSON.stringify(result.data)); persistence = "available"; }
      } catch { /* Private mode/quota restrictions must not break controls. */ }
      snapshot = { preferences: Object.freeze(result.data), persistence };
      notify();
      return true;
    },
  };
}
