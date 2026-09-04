import { hash, verify, type Options } from "@node-rs/argon2";

export const ARGON2ID_POLICY = Object.freeze({
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} satisfies Options);

export function hashPassword(password: string) {
  return hash(password, ARGON2ID_POLICY);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
