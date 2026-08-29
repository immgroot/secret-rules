import { createHash } from "node:crypto";
import type { RandomSource } from "./types.ts";

function seedWords(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  return [digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12)] as const;
}

/** xoshiro128**: deterministic and isolated from security-sensitive random token generation. */
export function seededRandom(seed: string): RandomSource {
  let [a, b, c, d] = seedWords(seed);
  const next = () => {
    const result = Math.imul(((Math.imul(b, 5) << 7) | (Math.imul(b, 5) >>> 25)), 9) >>> 0;
    const t = (b << 9) >>> 0;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = ((d << 11) | (d >>> 21)) >>> 0;
    return result / 0x1_0000_0000;
  };
  return {
    next,
    integer(min, maxInclusive) { return min + Math.floor(next() * (maxInclusive - min + 1)); },
    pick<T>(values: readonly T[]) {
      if (values.length === 0) throw new Error("Cannot choose from an empty set.");
      return values[Math.floor(next() * values.length)]!;
    },
    shuffle<T>(values: readonly T[]) {
      const copy = [...values];
      for (let index = copy.length - 1; index > 0; index--) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
      }
      return copy;
    },
  };
}

export function deterministicUuid(namespace: string) {
  const hex = createHash("sha256").update(namespace).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
