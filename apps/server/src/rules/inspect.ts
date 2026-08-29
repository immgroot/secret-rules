import { CORE_PREVIEW_MINI_GAME, generateRuleSet } from "./engine.ts";
import { mockPlayers } from "./simulate.ts";

if (process.env.NODE_ENV === "production") throw new Error("The Secret Rule inspector is development-only.");
const argument = (name: string, fallback: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const playerCount = Number.parseInt(argument("players", "6"), 10);
const chaos = argument("chaos", "normal");
if (![4, 6, 8, 10].includes(playerCount) || !["chill", "normal", "chaos"].includes(chaos)) throw new Error("Use --players=4|6|8|10 and --chaos=chill|normal|chaos.");
const seed = argument("seed", `preview-${playerCount}-${chaos}`);
const players = mockPlayers(playerCount);
const generated = generateRuleSet({ seed, roundNumber: 1, miniGameId: CORE_PREVIEW_MINI_GAME.id, players, settings: { chaos: chaos as "chill" | "normal" | "chaos" }, capabilities: CORE_PREVIEW_MINI_GAME.capabilities });
console.log(`${playerCount} PLAYERS\n${chaos.toUpperCase()}\nSEED: ${seed}\n`);
for (const player of players) {
  const rule = generated.allSecretRules.get(player.playerId)!;
  console.log(`${player.displayName}\n${rule.description}\n[${rule.templateId} · ${rule.category.toUpperCase()}]\n`);
}
console.log(`QUALITY: ${generated.validationMetadata.qualityScore}\nATTEMPTS: ${generated.validationMetadata.attempts}\nFALLBACK: ${generated.validationMetadata.usedFallback ? "YES" : "NO"}`);
