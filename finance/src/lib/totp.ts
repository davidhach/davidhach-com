/**
 * TOTP (RFC 6238) + one-time recovery codes.
 *
 * Secret is stored KEK-encrypted (encryptStringWithKek). The plaintext base32
 * secret only exists in memory while we render the QR / verify codes.
 *
 * Recovery codes are stored as a newline-joined list of argon2id hashes — same
 * algorithm as the user password. Verification consumes (removes) the matched
 * hash so each code is one-time.
 */
import { authenticator } from "otplib";
import { randomBytes, randomInt } from "node:crypto";
import { encryptStringWithKek, decryptStringWithKek } from "./crypto";
import { hashPassword, verifyPassword } from "./password";

authenticator.options = { window: 1, step: 30, digits: 6 };

const ISSUER = "Ledger";

export function generateSecret(): string {
  return authenticator.generateSecret(); // base32, 32 chars
}

export function buildOtpauthUrl(accountEmail: string, secret: string): string {
  return authenticator.keyuri(accountEmail, ISSUER, secret);
}

export function verifyTotp(secret: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return authenticator.verify({ token: clean, secret });
}

export function sealSecret(secret: string): string {
  return encryptStringWithKek(secret);
}

export function openSecret(sealed: string): string {
  return decryptStringWithKek(sealed);
}

// ─── Recovery codes ────────────────────────────────────────────────────────

const RECOVERY_COUNT = 10;
const CODE_GROUPS = 2;     // "XXXXX-XXXXX"
const CODE_GROUP_LEN = 5;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous (no 0/O/1/I)

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    const groups: string[] = [];
    for (let g = 0; g < CODE_GROUPS; g++) {
      let s = "";
      for (let c = 0; c < CODE_GROUP_LEN; c++) s += ALPHABET[randomInt(ALPHABET.length)];
      groups.push(s);
    }
    codes.push(groups.join("-"));
  }
  return codes;
}

export async function hashRecoveryCodes(codes: string[]): Promise<string> {
  const hashed = await Promise.all(codes.map((c) => hashPassword(normaliseCode(c))));
  return hashed.join("\n");
}

function normaliseCode(c: string): string {
  return c.replace(/\s+/g, "").toUpperCase();
}

/**
 * Find a matching recovery-code hash and return the remaining hashes (one consumed).
 * Returns null if no match. Caller persists the new joined string.
 */
export async function consumeRecoveryCode(
  joinedHashes: string,
  candidate: string,
): Promise<string | null> {
  const cleaned = normaliseCode(candidate);
  const hashes = joinedHashes.split("\n").filter(Boolean);
  for (let i = 0; i < hashes.length; i++) {
    if (await verifyPassword(hashes[i], cleaned)) {
      hashes.splice(i, 1);
      return hashes.join("\n");
    }
  }
  return null;
}

/** Cryptographically-random token for password-reset URLs. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}
