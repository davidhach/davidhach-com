import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { passwordResetConfirmInput } from "@/lib/validation";
import { revokeAllSessions, issueSession } from "@/lib/auth-session";
import { recordAudit } from "@/lib/audit";

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const parsed = passwordResetConfirmInput.safeParse(body);
  if (!parsed.success || !userId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { token, newPassword } = parsed.data;

  const weak = validatePasswordStrength(newPassword);
  if (weak) return NextResponse.json({ error: weak.reason }, { status: 400 });

  const identifier = `pwreset:${userId}`;
  const tokenHash = hashToken(token);

  // Constant-time match across the user's outstanding reset rows.
  const rows = await prisma.verificationToken.findMany({ where: { identifier } });
  const now = new Date();
  const match = rows.find((r) => {
    if (r.expires < now) return false;
    const a = Buffer.from(r.token);
    const b = Buffer.from(tokenHash);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!match) {
    return NextResponse.json({ error: "Token expired or invalid" }, { status: 401 });
  }

  // Consume every reset token for this user, then update the password.
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);

  await revokeAllSessions(userId);
  await issueSession(userId);
  await recordAudit({ userId, action: "auth.password.reset", req });

  return NextResponse.json({ ok: true });
}
