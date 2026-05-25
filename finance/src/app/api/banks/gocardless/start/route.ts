/**
 * POST /api/banks/gocardless/start
 *   { institutionId, institutionName }
 *
 * Creates a PENDING BankConnection + a GoCardless requisition, then returns
 * the bank-hosted consent URL. The user clicks through, authenticates with
 * their bank, and gets bounced back to /api/banks/gocardless/callback which
 * promotes the connection to a link-accounts UI.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { createRequisition } from "@/lib/bank/gocardless/client";
import { recordAudit } from "@/lib/audit";

const input = z.object({
  institutionId: z.string().min(1).max(120),
  institutionName: z.string().min(1).max(200),
});

function redirectUrl(): string {
  // GoCardless requires an absolute https URL.
  const base = process.env.GOCARDLESS_REDIRECT_URL
    ?? process.env.AUTH_URL
    ?? process.env.NEXTAUTH_URL;
  if (!base) throw new Error("Set GOCARDLESS_REDIRECT_URL or AUTH_URL");
  return new URL("/api/banks/gocardless/callback", base).toString();
}

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  // Pre-create the BankConnection row so we can pass its id as the requisition
  // `reference`, which GoCardless echoes back on callback.
  const conn = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "gocardless",
      institutionId: data.institutionId,
      institutionName: data.institutionName,
      status: "PENDING",
    },
  });

  try {
    const req2 = await createRequisition({
      institutionId: data.institutionId,
      redirect: redirectUrl(),
      reference: conn.id,
    });
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { requisitionId: req2.id, consentExpiresAt: futureConsent() },
    });
    await recordAudit({
      userId, action: "bank.gocardless.start", targetType: "BankConnection", targetId: conn.id,
      after: { institutionId: data.institutionId }, req,
    });
    return NextResponse.json({ connectionId: conn.id, redirectUrl: req2.link });
  } catch (e) {
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: (e as Error).message },
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});

function futureConsent(): Date {
  // GoCardless requisitions are valid for 90 days by default.
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 90);
  return d;
}
