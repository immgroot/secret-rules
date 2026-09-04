import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { username } from "better-auth/plugins/username";
import { AvatarIdSchema } from "@secret-rules/shared";
import { prisma } from "./database.ts";
import { resetEmail, sendAuthEmail, verificationEmail } from "./email.ts";
import { authBaseURL, authJwtAudience, authJwtIssuer, authSecret } from "./environment.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { registerEmailVerificationToken, sealEmailVerificationToken } from "./verification.ts";

const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scope: ["openid", "email", "profile"],
  },
} : {};

const discord = process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET ? {
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    scope: ["identify", "email"],
  },
} : {};

export const auth = betterAuth({
  appName: "SECRET RULES",
  baseURL: authBaseURL,
  basePath: "/api/auth",
  secret: authSecret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [authBaseURL],
  socialProviders: { ...google, ...discord },
  user: {
    additionalFields: {
      avatarId: {
        type: "string",
        required: true,
        defaultValue: "lime",
        validator: { input: AvatarIdSchema },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
    sendResetPassword: async ({ user, url }) => sendAuthEmail(resetEmail(user.email, url)),
  },
  emailVerification: {
    expiresIn: 60 * 60,
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url, token }) => {
      const opaqueToken = await sealEmailVerificationToken(user.id, token);
      await registerEmailVerificationToken(user.id, opaqueToken);
      const opaqueURL = new URL(url);
      opaqueURL.searchParams.set("token", opaqueToken);
      await sendAuthEmail(verificationEmail(user.email, opaqueURL.toString()));
    },
  },
  account: {
    updateAccountOnSignIn: true,
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      requireLocalEmailVerified: true,
    },
  },
  verification: { storeIdentifier: "hashed" },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 30,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
      "/send-verification-email": { window: 60 * 10, max: 3 },
      "/request-password-reset": { window: 60 * 10, max: 3 },
      "/reset-password": { window: 60 * 10, max: 5 },
      "/sign-in/social": { window: 60, max: 12 },
      "/callback/*": { window: 60, max: 20 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    disableCSRFCheck: false,
    disableOriginCheck: false,
    cookiePrefix: "secret_rules",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 20,
      usernameValidator: (value) => /^[A-Za-z0-9_]+$/.test(value),
      displayUsernameValidator: (value) => value.length >= 3 && value.length <= 20,
      usernameNormalization: (value) => value.toLowerCase(),
    }),
    jwt({
      jwt: {
        issuer: authJwtIssuer,
        audience: authJwtAudience,
        expirationTime: "5m",
        definePayload: ({ user }) => ({ sub: user.id }),
      },
      jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
