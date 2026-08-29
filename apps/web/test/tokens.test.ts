import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Tests compile into .test-build/test; inspect the actual source token file.
const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
const tokens = new Map([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => {
  const [, name, color] = match;
  assert.ok(name && color);
  return [name, color] as const;
}));

function luminance(token: string): number {
  const color = tokens.get(token);
  assert.ok(color, `Missing color token: ${token}`);
  function channel(offset: number): number {
    const value = Number.parseInt(color!.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

test("semantic text colors meet 4.5:1 contrast on their intended surfaces", () => {
  const pairs = [
    ["text", "page"], ["text-secondary", "page"], ["text-muted", "page"],
    ["text-secondary", "elevated"], ["text-muted", "elevated"], ["text-muted", "card"],
    ["ink", "secret"], ["ink-muted", "secret"],
    ["ink", "secret-green"], ["ink-muted", "secret-green"],
    ["ink", "accent-secondary"], ["ink-muted", "accent-secondary"],
    ["ink", "accent"], ["ink", "danger"],
    ["success", "elevated"], ["warning", "elevated"], ["danger", "elevated"],
  ] as const;
  for (const [foreground, background] of pairs) {
    const a = luminance(foreground);
    const b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
  }
});
