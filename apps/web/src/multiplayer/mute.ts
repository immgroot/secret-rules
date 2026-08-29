import { z } from "zod";
import type { SessionStorage } from "./session.ts";

const KEY = "secret-rules:personal-mutes:v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const Entry = z.strictObject({ roomId: z.uuid(), viewerId: z.uuid(), muted: z.array(z.uuid()).max(100), updatedAt: z.number().int().nonnegative() });
const Entries = z.array(Entry).max(20);
function read(storage: SessionStorage | null, now: number) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw || raw.length > 100_000) return [];
    const parsed = Entries.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.filter((entry) => entry.updatedAt <= now && now - entry.updatedAt < MAX_AGE) : [];
  } catch { return []; }
}
/** Local presentation preference, never a network command or a global silence. */
export function readMutes(storage: SessionStorage | null, roomId: string, viewerId: string, now = Date.now()) {
  return read(storage, now).find((entry) => entry.roomId === roomId && entry.viewerId === viewerId)?.muted ?? [];
}
export function saveMutes(storage: SessionStorage | null, roomId: string, viewerId: string, muted: string[], now = Date.now()) {
  try {
    const entry = Entry.parse({ roomId, viewerId, muted: [...new Set(muted)].filter((id) => id !== viewerId).slice(-100), updatedAt: now });
    const others = read(storage, now).filter((item) => item.roomId !== roomId || item.viewerId !== viewerId);
    storage?.setItem(KEY, JSON.stringify([...others.slice(-19), entry]));
  } catch { /* The client still retains its in-memory preference if storage is blocked. */ }
}
