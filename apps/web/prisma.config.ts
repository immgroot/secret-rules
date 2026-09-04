import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Prisma generate and production builds do not connect. Runtime auth requests
    // are separately gated and never use this deliberately unreachable fallback.
    url: process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:1/secret_rules",
  },
});
