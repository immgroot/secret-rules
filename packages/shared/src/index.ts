import { z } from "zod";
export * from "./lobby.ts";
export * from "./errors.ts";
export * from "./rules.ts";
export * from "./button-modes.ts";
export * from "./button-v2.ts";

// This package is browser-safe. Never add private rule catalogs or server state.
export const HealthResponseSchema = z.strictObject({
  service: z.literal("secret-rules-server"),
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
