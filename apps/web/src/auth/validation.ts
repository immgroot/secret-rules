import { AVATAR_IDS, DisplayNameSchema } from "@secret-rules/shared";
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const AuthEmailSchema = z.string().max(254).trim().toLowerCase().pipe(z.email());
export const UsernameSchema = z.string().min(3).max(20).regex(/^[A-Za-z0-9_]+$/).transform((value) => value.toLowerCase());
export const AuthPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const SignUpSchema = z.strictObject({
  name: DisplayNameSchema,
  username: UsernameSchema,
  email: AuthEmailSchema,
  password: AuthPasswordSchema,
  confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  avatarId: z.enum(AVATAR_IDS).default("lime"),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export const SignInSchema = z.strictObject({ email: AuthEmailSchema, password: z.string().max(PASSWORD_MAX_LENGTH) });
export const ResetRequestSchema = z.strictObject({ email: AuthEmailSchema });
export const ResetPasswordSchema = z.strictObject({
  // Better Auth owns the opaque token format and validates its authenticity.
  token: z.string().min(1).max(2048),
  password: AuthPasswordSchema,
  confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
}).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "your email address";
  return `${local[0]}${"*".repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function passwordStrength(password: string) {
  let score = password.length >= PASSWORD_MIN_LENGTH ? 1 : 0;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return score <= 1 ? "STARTING" : score === 2 ? "SOLID" : "STRONG";
}
