/**
 * Issues an Auth.js-compatible DB session for password-login users.
 *
 * Why custom: Auth.js v5's Credentials provider doesn't create Session rows
 * when paired with PrismaAdapter + `strategy: "database"` — Credentials has
 * no `Account` to anchor to. Since we want DB-backed (revocable) sessions for
 * both magic-link AND password login, we sidestep Credentials and create the
 * Session row + cookie ourselves. `auth()` then finds it via the PrismaAdapter
 * exactly the same way as a magic-link session.
 *
 * Cookie names match Auth.js v5 defaults:
 *   - HTTPS: `__Secure-authjs.session-token`
 *   - HTTP:  `authjs.session-token`
 */
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days — matches auth.ts config

function cookieName(): { name: string; secure: boolean } {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  const secure = url.startsWith("https://") || process.env.NODE_ENV === "production";
  return { name: secure ? "__Secure-authjs.session-token" : "authjs.session-token", secure };
}

export async function issueSession(userId: string): Promise<void> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000);

  await prisma.session.create({
    data: { sessionToken, userId, expires },
  });

  const { name, secure } = cookieName();
  const store = await cookies();
  store.set({
    name,
    value: sessionToken,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function revokeCurrentSession(): Promise<void> {
  const { name } = cookieName();
  const store = await cookies();
  const token = store.get(name)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
    store.delete(name);
  }
}

/** Revoke ALL sessions for a user — used after password change or 2FA enrollment. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

// ─── Short-lived signed cookie for the TOTP intermediate step ───────────────
// After password verifies but before the TOTP code is submitted, we set this
// cookie so step 2 knows which user is mid-login without holding the password.

const TOTP_PENDING_COOKIE = "ledger.totp-pending";
const TOTP_PENDING_TTL_MS = 5 * 60 * 1000;

function hmacSecret(): Buffer {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(s, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", hmacSecret()).update(payload).digest("base64url");
}

export async function setTotpPendingCookie(userId: string): Promise<void> {
  const exp = Date.now() + TOTP_PENDING_TTL_MS;
  const payload = `${userId}.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const { secure } = cookieName();
  const store = await cookies();
  store.set({
    name: TOTP_PENDING_COOKIE,
    value,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TOTP_PENDING_TTL_MS / 1000,
  });
}

export async function readTotpPendingCookie(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(TOTP_PENDING_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = Buffer.from(sign(`${userId}.${expStr}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(expStr) < Date.now()) return null;
  return userId;
}

export async function clearTotpPendingCookie(): Promise<void> {
  const store = await cookies();
  store.delete(TOTP_PENDING_COOKIE);
}
