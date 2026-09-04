import { z } from "zod";

const authEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  RESEND_API_KEY: z.string().min(1),
  AUTH_EMAIL_FROM: z.string().min(3),
  AUTH_JWT_ISSUER: z.url({ protocol: /^https?$/ }),
  AUTH_JWT_AUDIENCE: z.string().min(3).max(200),
});

const providerPair = (id: string | undefined, secret: string | undefined) => Boolean(id) === Boolean(secret);

export const authProviders = Object.freeze({
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  discord: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
});

export function authRuntimeConfigured() {
  const result = authEnvironmentSchema.safeParse(process.env);
  if (!result.success) return false;
  if (!providerPair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)) return false;
  if (!providerPair(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET)) return false;
  return process.env.NODE_ENV !== "production" || (result.data.BETTER_AUTH_URL.startsWith("https://") && result.data.AUTH_JWT_ISSUER.startsWith("https://"));
}

export function assertAuthEnvironment() {
  const result = authEnvironmentSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid authentication environment: ${[...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(", ")}`);
  if (process.env.NODE_ENV === "production" && (!result.data.BETTER_AUTH_URL.startsWith("https://") || !result.data.AUTH_JWT_ISSUER.startsWith("https://"))) throw new Error("Invalid authentication environment: production auth URLs require HTTPS");
  if (!providerPair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)) throw new Error("Invalid authentication environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET");
  if (!providerPair(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET)) throw new Error("Invalid authentication environment: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET");
  return result.data;
}

export const authBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
export const authSecret = process.env.BETTER_AUTH_SECRET ?? "local-build-only-secret-local-build-only-secret";
export const authJwtIssuer = process.env.AUTH_JWT_ISSUER ?? `${authBaseURL}/api/auth`;
export const authJwtAudience = process.env.AUTH_JWT_AUDIENCE ?? "secret-rules-realtime";
