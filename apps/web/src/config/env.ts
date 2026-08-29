import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_REALTIME_URL: z.url({ protocol: /^https?$/ }),
});

const result = publicEnvironmentSchema.safeParse({
  // Access public variables explicitly so Next.js can replace them at build time.
  NEXT_PUBLIC_REALTIME_URL:
    process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001",
});

if (!result.success) {
  // Do not print environment values, even for a currently public setting.
  throw new Error("Invalid public environment: NEXT_PUBLIC_REALTIME_URL");
}

export const publicEnv = result.data;
