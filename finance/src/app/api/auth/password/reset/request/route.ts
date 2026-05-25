/**
 * Step 1 of password reset. Generates a 32-byte token, stores its HASH in the
 * existing VerificationToken table (Auth.js's table — repurposed), and emails
 * the plaintext token to the user.
 *
 * Token row identifier is `pwreset:<userId>` so it can't collide with magic-link
 * tokens (whose identifier is the email address).
 *
 * Always returns 200 — no user enumeration.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { passwordResetRequestInput } from "@/lib/validation";
import { generateResetToken } from "@/lib/totp";
import { sendMail } from "@/lib/email";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export async function POST(req: Request) {
  const ip = rateLimit(`pwreset-ip:${clientKey(req)}`, 5, 60 * 60 * 1000);
  if (!ip.ok) return NextResponse.json({ ok: true }); // pretend success

  const body = await req.json().catch(() => null);
  const parsed = passwordResetRequestInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ ok: true });

  const token = generateResetToken();
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.verificationToken.create({
    data: {
      identifier: `pwreset:${user.id}`,
      token: hashToken(token), // store hash, not plaintext
      expires,
    },
  });

  const url = `${process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ""}/reset?token=${encodeURIComponent(token)}&u=${user.id}`;
  await sendMail({
    to: email,
    subject: "Reset your Ledger password",
    text: `Open this link within 30 minutes to set a new password:\n\n${url}\n\nIf you did not request this, ignore this message.`,
  });

  return NextResponse.json({ ok: true });
}
