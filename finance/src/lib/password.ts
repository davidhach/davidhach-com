/**
 * Password hashing with argon2id via @node-rs/argon2 (no peer-conflict with next-auth,
 * unlike the `argon2` npm package which is why CLAUDE.md says not to re-add it).
 *
 * OWASP 2024 ASVS L1 parameters: m=19MiB, t=2, p=1. Fast enough on Vercel's
 * 1024-MB function (≈40 ms per hash) yet costly enough to deter offline cracking.
 */
import { hash, verify, Algorithm } from "@node-rs/argon2";

const PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

const MIN_LEN = 12;

export interface StrengthIssue {
  reason: string;
}

/** Lightweight strength check — not a zxcvbn replacement, but blocks the obvious. */
export function validatePasswordStrength(pw: string): StrengthIssue | null {
  if (pw.length < MIN_LEN) return { reason: `Must be at least ${MIN_LEN} characters.` };
  if (pw.length > 256) return { reason: "Too long (max 256 chars)." };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return { reason: "Use 3 of: lowercase, uppercase, digit, symbol." };
  return null;
}

export function hashPassword(pw: string): Promise<string> {
  return hash(pw, PARAMS);
}

/** Returns false on mismatch, throws only on a corrupt hash format. */
export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw, PARAMS);
  } catch {
    return false;
  }
}
