import { z } from "zod";
import { SessionGrantSchema, type SessionGrant } from "@secret-rules/shared";

export const ROOM_SESSION_KEY = "secret-rules:room-session:v1";
const StoredSessionSchema = z.strictObject({ version: z.literal(1), session: SessionGrantSchema });
export type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Only this tab's room credential. Never expose it through React render state. */
export function readRoomSession(storage: SessionStorage | null): SessionGrant | null {
  try {
    const raw = storage?.getItem(ROOM_SESSION_KEY);
    if (!raw || raw.length > 2048) return null;
    const parsed = StoredSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.session : null;
  } catch { return null; }
}
export function saveRoomSession(storage: SessionStorage | null, session: SessionGrant | null) {
  if (!storage) return false;
  try {
    if (session) storage.setItem(ROOM_SESSION_KEY, JSON.stringify({ version: 1, session: SessionGrantSchema.parse(session) }));
    else storage.removeItem(ROOM_SESSION_KEY);
    return true;
  } catch { return false; }
}
