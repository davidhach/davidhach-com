/**
 * POST /api/banks/enablebanking/start
 *   { aspspName, aspspCountry, psuType? }
 *
 * Creates a PENDING BankConnection and an Enable Banking auth session, then
 * returns the bank-hosted consent URL. After the user consents the bank
 * redirects to /api/banks/enablebanking/callback?code=…&state=<connectionId>.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { startAuth, isConfigured } from "@/lib/bank/enablebanking/client";
import { recordAudit } from "@/lib/audit";

const input = z.object({
  aspspName: z.string().min(1).max(200),
  aspspCountry: z.string().length(2).toUpperCase(),
  psuType: z.enum(["personal", "business"]).optional(),
});

function redirectUrl(): string {
  const base = process.env.ENABLE_BANKING_REDIRECT_URL
    ?? process.env.AUTH_URL
    ?? process.env.NEXTAUTH_URL;
  if (!base) throw new Error("Set ENABLE_BANKING_REDIRECT_URL or AUTH_URL");
  if (process.env.ENABLE_BANKING_REDIRECT_URL) return process.env.ENABLE_BANKING_REDIRECT_URL;
  return new URL("/api/banks/enablebanking/callback", base).toString();
}

function futureConsent(days = 180): Date {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export const POST = withAuth(async (userId, req) => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Enable Banking not configured." },
      { status: 503 },
    );
  }
  const data = await parseBody(req, input);

  // Pre-create the BankConnection so we can pass its id as the `state` and
  // correlate the callback back to a specific row.
  const conn = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "enablebanking",
      institutionId: `${data.aspspCountry}:${data.aspspName}`,
      institutionName: data.aspspName,
      status: "PENDING",
    },
  });

  try {
    // Surface signing/PEM failures with their precise message instead of
    // the generic "Failed" the UI would otherwise show.
    const auth = await startAuth({
      aspspName: data.aspspName,
      aspspCountry: data.aspspCountry,
      redirectUrl: redirectUrl(),
      state: conn.id,
      psuType: data.psuType,
    });
    // We don't have a session_id yet — that comes after the user consents and
    // we exchange the code. Stash the authorization_id in lastError for traceability.
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { consentExpiresAt: futureConsent(), lastError: null },
    });
    await recordAudit({
      userId, action: "bank.enablebanking.start",
      targetType: "BankConnection", targetId: conn.id,
      after: { aspsp: data.aspspName, country: data.aspspCountry, authorization_id: auth.authorization_id }, req,
    });
    return NextResponse.json({ connectionId: conn.id, redirectUrl: auth.url });
  } catch (e) {
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: (e as Error).message },
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
