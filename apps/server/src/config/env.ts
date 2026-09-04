import { z } from "zod";

export const DEVELOPMENT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3100", "http://127.0.0.1:3100"];
const originsSchema = z.string().max(2048).transform((value) => value.split(",").map((origin) => origin.trim()))
  .pipe(z.array(z.url({ protocol: /^https?$/ }).refine((value) => URL.canParse(value) && new URL(value).origin === value, "Use an origin without paths or credentials.")).min(1).max(20));

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.union([z.ipv4(), z.ipv6()]).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  ALLOWED_ORIGINS: originsSchema.default(DEVELOPMENT_ORIGINS),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
  ROOM_IDLE_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(7_200_000),
  AFK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900_000).default(180_000),
  AUTH_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
  AUTH_JWT_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
  AUTH_JWT_AUDIENCE: z.string().min(3).max(200).optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerEnvironment {
  if (
    environment.NODE_ENV === "production" &&
    (!environment.HOST || !environment.PORT || !environment.ALLOWED_ORIGINS)
  ) {
    throw new Error("Production requires explicit HOST and PORT and ALLOWED_ORIGINS configuration.");
  }

  const result = serverEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    // Report field names only; never echo configuration values or credentials.
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }

  const authValues = [result.data.AUTH_JWKS_URL, result.data.AUTH_JWT_ISSUER, result.data.AUTH_JWT_AUDIENCE];
  if (authValues.some(Boolean) && !authValues.every(Boolean)) throw new Error("Invalid server environment: AUTH_JWKS_URL, AUTH_JWT_ISSUER, AUTH_JWT_AUDIENCE must be configured together.");
  if (result.data.NODE_ENV === "production" && (result.data.AUTH_JWKS_URL?.startsWith("http://") || result.data.AUTH_JWT_ISSUER?.startsWith("http://"))) throw new Error("Invalid server environment: authentication URLs require HTTPS in production.");

  return result.data;
}
