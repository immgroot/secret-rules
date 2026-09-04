import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";
import { symmetricEncodeJWT } from "better-auth/crypto";
import { auth as productionAuth } from "../src/auth/server.ts";
import { ARGON2ID_POLICY, hashPassword, verifyPassword } from "../src/auth/password.ts";
import { consumeEmailVerificationToken, openEmailVerificationRequest, sealEmailVerificationToken, verificationTokenDigest } from "../src/auth/verification.ts";
import { maskEmail, passwordStrength, ResetPasswordSchema, safeInternalPath, SignInSchema, SignUpSchema } from "../src/auth/validation.ts";

test("account inputs normalize identity fields and reject unsafe or mismatched data", () => {
  const valid = SignUpSchema.parse({ name: "  Groot  ", username: "GROOT_7", email: " GROOT@Example.com ", password: "a long passphrase 42", confirmPassword: "a long passphrase 42", avatarId: "lime" });
  assert.equal(valid.name, "Groot");
  assert.equal(valid.username, "groot_7");
  assert.equal(valid.email, "groot@example.com");
  assert.equal(SignUpSchema.safeParse({ ...valid, confirmPassword: "not the same" }).success, false);
  assert.equal(SignUpSchema.safeParse({ ...valid, username: "bad handle" }).success, false);
  assert.equal(SignInSchema.safeParse({ email: "not-email", password: "anything" }).success, false);
  assert.equal(safeInternalPath("https://attacker.invalid", "/"), "/");
  assert.equal(safeInternalPath("//attacker.invalid", "/"), "/");
  assert.equal(safeInternalPath("/account", "/"), "/account");
  assert.equal(maskEmail("groot@example.com"), "g****@example.com");
  assert.equal(passwordStrength("correct horse battery staple"), "STRONG");
});

test("password credentials use Argon2id with the production memory policy and unique salts", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.match(first, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.equal(ARGON2ID_POLICY.memoryCost, 65_536);
  assert.equal(await verifyPassword(first, "correct horse battery staple"), true);
  assert.equal(await verifyPassword(first, "wrong password"), false);
  assert.equal(await verifyPassword("not-a-hash", "anything"), false);
});

test("production email verification stores only a deterministic token digest for one-time consumption", async () => {
  const token = "signed-secret-verification-token";
  const digest = verificationTokenDigest(token);
  assert.equal(digest.length, 64);
  assert.notEqual(digest, token);
  assert.equal(verificationTokenDigest(token), digest);
  const source = readFileSync(new URL("../../src/auth/verification.ts", import.meta.url), "utf8");
  assert.match(source, /expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(source, /consumed\.count !== 1/);
  assert.doesNotMatch(source, /value:\s*token[,}]/);
});

function authFixture(rateLimits = false) {
  const secret = "test-secret-that-is-long-enough-for-better-auth";
  const verificationURLs: string[] = [];
  const verificationDigests = new Map<string, string>();
  const resetURLs: string[] = [];
  const db = { user: [] as Record<string, unknown>[], session: [] as Record<string, unknown>[], account: [] as Record<string, unknown>[], verification: [] as Record<string, unknown>[], rateLimit: [] as Record<string, unknown>[], jwks: [] as Record<string, unknown>[] };
  const instance = betterAuth({
    ...productionAuth.options,
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    secret,
    database: memoryAdapter(db),
    rateLimit: { ...productionAuth.options.rateLimit, enabled: rateLimits },
    emailAndPassword: {
      ...productionAuth.options.emailAndPassword,
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
      sendResetPassword: async ({ url }) => { resetURLs.push(url); },
    },
    emailVerification: { expiresIn: 3600, sendOnSignUp: true, autoSignInAfterVerification: false, sendVerificationEmail: async ({ user, url, token }) => {
      const opaque = await sealEmailVerificationToken(user.id, token, secret);
      verificationDigests.set(user.id, verificationTokenDigest(opaque));
      const delivered = new URL(url); delivered.searchParams.set("token", opaque);
      verificationURLs.push(delivered.toString());
    } },
  });
  const request = async (path: string, body?: unknown, cookie?: string) => {
    let incoming = new Request(path.startsWith("http") ? path : `http://localhost:3000/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: "http://localhost:3000", "x-forwarded-for": "192.0.2.10", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (new URL(incoming.url).pathname === "/api/auth/verify-email") {
      try {
        incoming = await openEmailVerificationRequest(incoming, secret, async (userId, opaqueRequest) => {
          const digest = verificationTokenDigest(new URL(opaqueRequest!.url).searchParams.get("token")!);
          if (verificationDigests.get(userId) !== digest) throw new Error("Invalid or expired verification link.");
          verificationDigests.delete(userId);
        });
      } catch { return new Response(null, { status: 400 }); }
    }
    return instance.handler(incoming);
  };
  return { request, verificationURLs, resetURLs, db };
}

test("email account lifecycle gates unverified login, verifies once, uses generic login errors, and logs out", async () => {
  const fixture = authFixture();
  const signUp = await fixture.request("/sign-up/email", { name: "GROOT", username: "groot", displayUsername: "groot", email: "groot@example.com", password: "correct horse battery staple" });
  assert.equal(signUp.status, 200);
  assert.equal(fixture.verificationURLs.length, 1);
  const duplicate = await fixture.request("/sign-up/email", { name: "GROOT", username: "groot", displayUsername: "groot", email: "groot@example.com", password: "correct horse battery staple" });
  assert.ok([200, 400, 422].includes(duplicate.status));
  const unverified = await fixture.request("/sign-in/email", { email: "groot@example.com", password: "correct horse battery staple" });
  assert.equal(unverified.status, 403);
  const wrong = await fixture.request("/sign-in/email", { email: "nobody@example.com", password: "wrong password" });
  assert.ok([400, 401].includes(wrong.status));
  const wrongExisting = await fixture.request("/sign-in/email", { email: "groot@example.com", password: "wrong password" });
  assert.equal(wrongExisting.status, wrong.status);
  assert.deepEqual(await wrongExisting.json(), await wrong.json());
  const verified = await fixture.request(fixture.verificationURLs[0]!);
  assert.ok(verified.status >= 200 && verified.status < 400);
  assert.equal(fixture.db.user[0]?.emailVerified, true);
  assert.equal((await fixture.request(fixture.verificationURLs[0]!)).status, 400, "the same delivered link cannot be reused");
  const login = await fixture.request("/sign-in/email", { email: "groot@example.com", password: "correct horse battery staple" });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  assert.match(cookie, /better-auth\.session_token|better_auth\.session_token|session_token/);
  const session = await fixture.request("/get-session", undefined, cookie);
  assert.equal(session.status, 200);
  const logout = await fixture.request("/sign-out", {}, cookie);
  assert.equal(logout.status, 200);
  assert.equal(await (await fixture.request("/get-session", undefined, cookie)).json(), null);
});

test("password reset requests stay generic and issue one-time server tokens", async () => {
  const fixture = authFixture();
  await fixture.request("/sign-up/email", { name: "NIDA", username: "nida", displayUsername: "nida", email: "nida@example.com", password: "another long passphrase" });
  await fixture.request(fixture.verificationURLs[0]!);
  const login = await fixture.request("/sign-in/email", { email: "nida@example.com", password: "another long passphrase" });
  const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const existing = await fixture.request("/request-password-reset", { email: "nida@example.com", redirectTo: "/reset-password" });
  const missing = await fixture.request("/request-password-reset", { email: "missing@example.com", redirectTo: "/reset-password" });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.equal(fixture.resetURLs.length, 1);
  const resetURL = new URL(fixture.resetURLs[0]!);
  const token = resetURL.searchParams.get("token") ?? resetURL.pathname.split("/").at(-1)!;
  assert.equal(ResetPasswordSchema.safeParse({ token, password: "new secure passphrase 2026", confirmPassword: "new secure passphrase 2026" }).success, true, "the real issued token must also pass the reset form's schema");
  assert.ok(fixture.db.verification.every((row) => !String(row.identifier).includes(token)), "reset bearer tokens must not be stored in plaintext");
  const reset = await fixture.request("/reset-password", { token, newPassword: "new secure passphrase 2026" });
  assert.equal(reset.status, 200);
  const reused = await fixture.request("/reset-password", { token, newPassword: "another secure passphrase" });
  assert.ok(reused.status >= 400);
  assert.equal(await (await fixture.request("/get-session", undefined, cookie)).json(), null, "reset revokes the old session");
  assert.equal((await fixture.request("/sign-in/email", { email: "nida@example.com", password: "new secure passphrase 2026" })).status, 200);
});

test("verification consumption uses expiry and the token digest and rejects reused tokens", async () => {
  let recorded: unknown;
  const request = new Request("http://localhost:3000/api/auth/verify-email?token=opaque-test-token");
  await consumeEmailVerificationToken("test-user", request, async (where) => {
    recorded = where;
    assert.ok(where.expiresAt.gt instanceof Date);
    return { count: 1 };
  });
  assert.ok(JSON.stringify(recorded).includes(verificationTokenDigest("opaque-test-token")));
  assert.ok(JSON.stringify(recorded).includes("secret-rules:email-verification:test-user"));
  await assert.rejects(consumeEmailVerificationToken("test-user", request, async () => ({ count: 0 })), /Invalid or expired/);
  await assert.rejects(consumeEmailVerificationToken("test-user"), /Invalid or expired/);
});

test("email links are randomized opaque ciphertext and tampering, wrong keys and expiry fail closed", async () => {
  const secret = "test-secret-that-is-long-enough-for-better-auth";
  const inner = "signed-token-with-readable-email-claim";
  const first = await sealEmailVerificationToken("test-user", inner, secret);
  const second = await sealEmailVerificationToken("test-user", inner, secret);
  assert.notEqual(first, second);
  assert.equal(first.includes(inner), false);
  const makeRequest = (token: string) => new Request(`http://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  let consumed = 0;
  const consume = async () => { consumed += 1; };
  const opened = await openEmailVerificationRequest(makeRequest(first), secret, consume);
  assert.equal(new URL(opened.url).searchParams.get("token"), inner);
  assert.equal(consumed, 1);
  await assert.rejects(openEmailVerificationRequest(makeRequest(first), `${secret}-wrong`, consume));
  await assert.rejects(openEmailVerificationRequest(makeRequest(`${first.slice(0, -10)}tampered!!`), secret, consume));
  const expired = await symmetricEncodeJWT({ sub: "test-user", token: inner }, secret, "secret-rules:email-verification", -600);
  await assert.rejects(openEmailVerificationRequest(makeRequest(expired), secret, consume));
  assert.equal(consumed, 1, "invalid ciphertext never reaches the token store");
});

test("expired reset tokens cannot change the password", async () => {
  const fixture = authFixture();
  await fixture.request("/sign-up/email", { name: "NOOR", username: "noor", email: "noor@example.com", password: "another long passphrase" });
  await fixture.request(fixture.verificationURLs[0]!);
  await fixture.request("/request-password-reset", { email: "noor@example.com", redirectTo: "/reset-password" });
  const token = new URL(fixture.resetURLs[0]!).pathname.split("/").at(-1)!;
  for (const row of fixture.db.verification) row.expiresAt = new Date(Date.now() - 1000);
  assert.ok((await fixture.request("/reset-password", { token, newPassword: "new secure passphrase" })).status >= 400);
});

test("verification resend is rate limited by the production route policy", async () => {
  const fixture = authFixture(true);
  for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await fixture.request("/send-verification-email", { email: "missing@example.com" })).status, 200);
  assert.equal((await fixture.request("/send-verification-email", { email: "missing@example.com" })).status, 429);
});

test("provider unlinking selects the owned account record, rejects foreign records and preserves the last method", async () => {
  const fixture = authFixture();
  await fixture.request("/sign-up/email", { name: "KIV", username: "kiv", email: "kiv@example.com", password: "another long passphrase" });
  await fixture.request(fixture.verificationURLs[0]!);
  const login = await fixture.request("/sign-in/email", { email: "kiv@example.com", password: "another long passphrase" });
  const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const userId = fixture.db.user[0]?.id;
  for (const provider of ["google", "discord"]) fixture.db.account.push({ id: `${provider}-local-record`, accountId: `${provider}-external-id`, providerId: provider, issuer: `https://${provider}.example`, userId, createdAt: new Date(), updatedAt: new Date() });
  assert.equal((await fixture.request("/unlink-account", { accountId: "foreign-record" }, cookie)).status, 400);
  assert.equal((await fixture.request("/unlink-account", { accountId: "google-external-id" }, cookie)).status, 400);
  assert.equal((await fixture.request("/unlink-account", { accountId: "google-local-record" }, cookie)).status, 200);
  assert.equal((await fixture.request("/unlink-account", { accountId: "discord-local-record" }, cookie)).status, 200);
  assert.equal((await fixture.request("/unlink-account", { accountId: fixture.db.account[0]?.id }, cookie)).status, 400);
  const panel = readFileSync(new URL("../../src/components/auth/account-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /unlinkAccount\(\{ accountId: account\.id \}\)/);
});

test("auth source keeps provider scopes minimal, implicit linking off, cookies hardened, and auth tokens out of localStorage", async () => {
  const { readFile } = await import("node:fs/promises");
  const server = await readFile(new URL("../../src/auth/server.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../../src/multiplayer/client.ts", import.meta.url), "utf8");
  assert.match(server, /disableImplicitLinking:\s*true/);
  assert.match(server, /scope:\s*\["openid",\s*"email",\s*"profile"\]/);
  assert.match(server, /scope:\s*\["identify",\s*"email"\]/);
  assert.match(server, /httpOnly:\s*true/);
  assert.match(server, /sameSite:\s*"lax"/);
  assert.doesNotMatch(client, /localStorage.*accountToken|accountToken.*localStorage/);
  assert.match(client, /\/api\/auth\/token/);
});
