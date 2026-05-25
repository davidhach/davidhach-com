import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifyTotp, openSecret, consumeRecoveryCode } from "@/lib/totp";
import {
  issueSession,
  setTotpPendingCookie,
  readTotpPendingCookie,
  clearTotpPendingCookie,
} from "@/lib/auth-session";
import { passwordLoginInput } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  // 10 attempts per 5 minutes per IP. Email-based bucket on top of that.
  const ipKey = clientKey(req);
  const ipBucket = rateLimit(`login-ip:${ipKey}`, 10, 5 * 60 * 1000);
  if (!ipBucket.ok) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429, headers: { "Retry-After": String(ipBucket.retryAfterSec) } });
  }

  const body = await req.json().catch(() => null);
  const parsed = passwordLoginInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, password, totp, recoveryCode } = parsed.data;

  const emailBucket = rateLimit(`login-email:${email}`, 10, 5 * 60 * 1000);
  if (!emailBucket.ok) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  // Stage 2: TOTP step. The user already passed password verification in stage 1.
  if (totp || recoveryCode) {
    const pendingUserId = await readTotpPendingCookie();
    if (!pendingUserId) {
      return NextResponse.json({ error: "Session expired, please sign in again." }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: pendingUserId } });
    if (!user || user.email !== email || !user.totpEnabled || !user.totpSecretEnc) {
      await clearTotpPendingCookie();
      return NextResponse.json({ error: "Invalid request" }, { status: 401 });
    }

    let ok = false;
    if (totp) {
      const secret = openSecret(user.totpSecretEnc);
      ok = verifyTotp(secret, totp);
    } else if (recoveryCode && user.recoveryCodesHash) {
      const remaining = await consumeRecoveryCode(user.recoveryCodesHash, recoveryCode);
      if (remaining !== null) {
        await prisma.user.update({
          where: { id: user.id },
          data: { recoveryCodesHash: remaining },
        });
        ok = true;
      }
    }

    if (!ok) {
      await recordAudit({ userId: user.id, action: "auth.totp.fail", req });
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    await clearTotpPendingCookie();
    await issueSession(user.id);
    await recordAudit({ userId: user.id, action: "auth.login", after: { method: recoveryCode ? "recovery" : "totp" }, req });
    return NextResponse.json({ ok: true });
  }

  // Stage 1: email + password.
  const user = await prisma.user.findUnique({ where: { email } });
  // Generic response to avoid user enumeration.
  const genericFail = () => NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (!user || !user.passwordHash) return genericFail();
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json({ error: "Account temporarily locked" }, { status: 423 });
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const fails = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    await recordAudit({ userId: user.id, action: "auth.password.fail", req });
    return genericFail();
  }

  // Password correct — reset failure counter.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  if (user.totpEnabled) {
    await setTotpPendingCookie(user.id);
    return NextResponse.json({ totpRequired: true });
  }

  await issueSession(user.id);
  await recordAudit({ userId: user.id, action: "auth.login", after: { method: "password" }, req });
  return NextResponse.json({ ok: true });
}
