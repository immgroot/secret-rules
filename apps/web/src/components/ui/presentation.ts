/** Display formatting only. Never reads a local clock or decides round expiry. */
export function formatRemainingTime(endTime: number | null, serverTime: number | null): string {
  if (endTime === null || serverTime === null || !Number.isFinite(endTime) || !Number.isFinite(serverTime)) return "--:--";
  const seconds = Math.max(0, Math.ceil((endTime - serverTime) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
