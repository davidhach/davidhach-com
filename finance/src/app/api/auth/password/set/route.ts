/**
 * Set or change the password.
 *
 *   First-time set: signed-in via magic-link, no `currentPassword` required
 *     (the magic-link login is already proof of email control).
 *   Change:         `currentPassword` required, verified before update.
 *
 * On success: all other sessions are revoked. The current session stays.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/password";
import { passwordSetInput } from "@/lib/validation";
import { revokeAllSessions, issueSession } from "@/lib/auth-session";
import { recordAudit } from "@/lib/audit";

export const POST = withAuth(async (userId, req) => {
  const body = await req.json().catch(() => null);
  const parsed = passwordSetInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { newPassword, currentPassword } = parsed.data;

  const weak = validatePasswordStrength(newPassword);
  if (weak) return NextResponse.json({ error: weak.reason }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });

  // Invalidate every existing session, then issue a fresh one for the caller.
  await revokeAllSessions(userId);
  await issueSession(userId);

  await recordAudit({
    userId,
    action: user.passwordHash ? "auth.password.change" : "auth.password.set",
    req,
  });

  return NextResponse.json({ ok: true });
});
