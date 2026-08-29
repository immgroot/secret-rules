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

  return result.data;
}
