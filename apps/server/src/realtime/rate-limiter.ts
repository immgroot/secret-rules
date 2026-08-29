/** Fixed windows with bounded key retention; raw proxy headers are never trusted. */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; until: number }>();
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  take(key: string, limit: number, windowMs: number) {
    const now = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.until <= now) {
      if (this.windows.size >= 5000) this.sweep();
      if (!this.windows.has(key) && this.windows.size >= 5000) return false;
      entry = { count: 0, until: now + windowMs };
      this.windows.set(key, entry);
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  }
  sweep() { for (const [key, value] of this.windows) if (value.until <= this.now()) this.windows.delete(key); }
  clear() { this.windows.clear(); }
}
