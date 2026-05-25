/**
 * Begin TOTP enrollment.
 * Generates a fresh secret, stores it KEK-encrypted with `totpEnabled = false`,
 * and returns the provisioning URI for the user's authenticator app to scan.
 * Enrollment is finalised by POST /api/auth/totp/confirm with a valid code.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { generateSecret, sealSecret, buildOtpauthUrl } from "@/lib/totp";
import { recordAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "TOTP already enabled. Disable it first to re-enroll." }, { status: 409 });
  }

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEnc: sealSecret(secret), totpEnabled: false },
  });

  await recordAudit({ userId, action: "auth.totp.enroll.begin", req });

  return NextResponse.json({
    otpauthUrl: buildOtpauthUrl(user.email, secret),
    secret, // shown once so the user can type it manually if needed
  });
}
