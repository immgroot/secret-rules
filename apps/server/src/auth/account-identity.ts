import { createRemoteJWKSet, errors, jwtVerify } from "jose";

export type AccountIdentityVerifier = (token: string) => Promise<string>;

export function createAccountIdentityVerifier(options: { jwksURL: string; issuer: string; audience: string }): AccountIdentityVerifier {
  const jwks = createRemoteJWKSet(new URL(options.jwksURL), { timeoutDuration: 3_000, cooldownDuration: 30_000 });
  return async (token) => {
    try {
      const result = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["EdDSA"],
        clockTolerance: 5,
        maxTokenAge: "5 minutes",
      });
      if (typeof result.payload.sub !== "string" || result.payload.sub.length < 10 || result.payload.sub.length > 128) throw new errors.JWTClaimValidationFailed("Invalid subject", result.payload, "sub", "invalid");
      return result.payload.sub;
    } catch {
      throw new Error("INVALID_ACCOUNT_TOKEN");
    }
  };
}
