import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const databaseURL = process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:1/secret_rules";
const globalDatabase = globalThis as typeof globalThis & { secretRulesPrisma?: PrismaClient };

export const prisma = globalDatabase.secretRulesPrisma ?? new PrismaClient({ adapter: new PrismaPg(databaseURL) });

if (process.env.NODE_ENV !== "production") globalDatabase.secretRulesPrisma = prisma;
