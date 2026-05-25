/**
 * Finalise TOTP enrollment. The user types the current 6-digit code from their
 * authenticator app. If it verifies against the pending secret we set
 * totpEnabled = true and issue 10 one-time recovery codes (shown ONCE).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { verifyTotp, openSecret, generateRecoveryCodes, hashRecoveryCodes } from "@/lib/totp";
import { totpConfirmInput } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export const POST = withAuth(async (userId, req) => {
  const body = await req.json().catch(() => null);
  const parsed = totpConfirmInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecretEnc) {
    return NextResponse.json({ error: "No pending enrollment" }, { status: 400 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "TOTP already enabled" }, { status: 409 });
  }

  const secret = openSecret(user.totpSecretEnc);
  if (!verifyTotp(secret, parsed.data.code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const recovery = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: true,
      recoveryCodesHash: await hashRecoveryCodes(recovery),
    },
  });

  await recordAudit({ userId, action: "auth.totp.enroll.complete", req });

  // Recovery codes shown ONCE.
  return NextResponse.json({ ok: true, recoveryCodes: recovery });
});
