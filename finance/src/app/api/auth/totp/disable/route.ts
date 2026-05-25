/**
 * Disable TOTP. Requires the current password as a sanity check so a stolen
 * session can't silently weaken auth.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { verifyPassword } from "@/lib/password";
import { totpDisableInput } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export const POST = withAuth(async (userId, req) => {
  const body = await req.json().catch(() => null);
  const parsed = totpDisableInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Set a password before managing 2FA." }, { status: 400 });
  }
  if (!user.totpEnabled) {
    return NextResponse.json({ error: "TOTP not enabled" }, { status: 400 });
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return NextResponse.json({ error: "Password incorrect" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecretEnc: null, recoveryCodesHash: null },
  });

  await recordAudit({ userId, action: "auth.totp.disable", req });

  return NextResponse.json({ ok: true });
});
