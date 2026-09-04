import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAccountIdentityVerifier } from "../src/auth/account-identity.ts";

test("realtime account identity accepts only a short-lived issuer and audience bound JWT", async (context) => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "auth-test", alg: "EdDSA", use: "sig" });
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  context.after(() => server.close());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const verifier = createAccountIdentityVerifier({ jwksURL: `http://127.0.0.1:${address.port}/jwks`, issuer: "https://accounts.secret-rules.test/api/auth", audience: "secret-rules-realtime" });
  const signed = (overrides: { audience?: string; issuer?: string; subject?: string; expires?: string } = {}) => new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: "auth-test" })
    .setIssuer(overrides.issuer ?? "https://accounts.secret-rules.test/api/auth")
    .setAudience(overrides.audience ?? "secret-rules-realtime")
    .setSubject(overrides.subject ?? "account-user-groot")
    .setIssuedAt()
    .setExpirationTime(overrides.expires ?? "2m")
    .sign(privateKey);
  assert.equal(await verifier(await signed()), "account-user-groot");
  await assert.rejects(() => verifier("not-a-jwt"), /INVALID_ACCOUNT_TOKEN/);
  await assert.rejects(() => signed({ audience: "another-service" }).then(verifier), /INVALID_ACCOUNT_TOKEN/);
  await assert.rejects(() => signed({ issuer: "https://attacker.invalid" }).then(verifier), /INVALID_ACCOUNT_TOKEN/);
  await assert.rejects(() => signed({ expires: "-10s" }).then(verifier), /INVALID_ACCOUNT_TOKEN/);
});
