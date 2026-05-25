/**
 * GET /api/banks/gocardless/accounts?connectionId=<id>
 *
 * After the user comes back from consent, the requisition now lists the
 * accounts they approved. We fetch them + their IBAN/currency so the linking
 * UI can show "checking account ending 1234 — EUR".
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import {
  getRequisition, getAccountDetails, isConsentExpired,
} from "@/lib/bank/gocardless/client";

export const GET = withAuth(async (userId, req) => {
  const connectionId = new URL(req.url).searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const conn = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId, provider: "gocardless" },
  });
  if (!conn?.requisitionId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const req2 = await getRequisition(conn.requisitionId);
    const accounts: Array<{ externalId: string; iban?: string; currency: string; name: string }> = [];
    for (const id of req2.accounts ?? []) {
      const det = await getAccountDetails(id);
      if (isConsentExpired(det)) {
        await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "CONSENT_EXPIRED" } });
        return NextResponse.json({ error: "Consent expired", consentExpired: true }, { status: 409 });
      }
      accounts.push({
        externalId: id,
        iban: det.account?.iban,
        currency: det.account?.currency ?? "EUR",
        name: det.account?.name ?? `Account ${id.slice(0, 6)}`,
      });
    }
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
