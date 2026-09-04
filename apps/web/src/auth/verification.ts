import { createHash, randomUUID } from "node:crypto";
import { APIError } from "better-auth";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "./database.ts";
import { authSecret } from "./environment.ts";

const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1_000;
const VERIFICATION_PURPOSE = "secret-rules:email-verification";
const EncryptedVerificationSchema = z.object({ sub: z.string().min(1).max(128), token: z.string().min(1).max(4096) });

// Use the framework's authenticated encryption, random JWT ID and expiry checks.
// The browser/email URL never receives the inner signed JWT's readable email claim.
export function sealEmailVerificationToken(userId: string, token: string, secret = authSecret) {
  return symmetricEncodeJWT({ sub: userId, token }, secret, VERIFICATION_PURPOSE, EMAIL_VERIFICATION_TTL_MS / 1000);
}

export async function openEmailVerificationRequest(
  request: Request,
  secret = authSecret,
  consume = consumeEmailVerificationToken,
) {
  const url = new URL(request.url);
  const opaqueToken = url.searchParams.get("token");
  if (!opaqueToken || opaqueToken.length > 8192) throw new APIError("BAD_REQUEST", { message: "Invalid or expired verification link." });
  const payload = EncryptedVerificationSchema.safeParse(await symmetricDecodeJWT<unknown>(opaqueToken, secret, VERIFICATION_PURPOSE));
  if (!payload.success) throw new APIError("BAD_REQUEST", { message: "Invalid or expired verification link." });
  await consume(payload.data.sub, request);
  url.searchParams.set("token", payload.data.token);
  return new Request(url, request);
}

export function verificationTokenDigest(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function identifier(userId: string) {
  return `secret-rules:email-verification:${userId}`;
}

export async function registerEmailVerificationToken(userId: string, token: string) {
  const tokenIdentifier = identifier(userId);
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier: tokenIdentifier } }),
    prisma.verification.create({ data: {
      id: randomUUID(),
      identifier: tokenIdentifier,
      value: verificationTokenDigest(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    } }),
  ]);
}

type VerificationMatch = { identifier: string; value: string; expiresAt: { gt: Date } };
type ConsumeMatchingToken = (where: VerificationMatch) => Promise<{ count: number }>;

export async function consumeEmailVerificationToken(
  userId: string,
  request?: Request,
  consume: ConsumeMatchingToken = (where) => prisma.verification.deleteMany({ where }),
) {
  const token = request ? new URL(request.url).searchParams.get("token") : null;
  if (!token) throw new APIError("BAD_REQUEST", { message: "Invalid or expired verification link." });
  const consumed = await consume({
    identifier: identifier(userId),
    value: verificationTokenDigest(token),
    expiresAt: { gt: new Date() },
  });
  if (consumed.count !== 1) throw new APIError("BAD_REQUEST", { message: "Invalid or expired verification link." });
}
