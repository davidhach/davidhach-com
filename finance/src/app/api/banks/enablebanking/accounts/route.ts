/**
 * GET /api/banks/enablebanking/accounts?connectionId=<id>
 * Reads the detected accounts under the session for this connection so the
 * linking UI can render them.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { getSession, isConsentExpired } from "@/lib/bank/enablebanking/client";

export const GET = withAuth(async (userId, req) => {
  const connectionId = new URL(req.url).searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const conn = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId, provider: "enablebanking" },
  });
  if (!conn?.requisitionId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const session = await getSession(conn.requisitionId);
    if (isConsentExpired(session)) {
      await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "CONSENT_EXPIRED" } });
      return NextResponse.json({ error: "Consent expired", consentExpired: true }, { status: 409 });
    }
    const list = session.accounts && session.accounts.length > 0
      ? session.accounts
      : (session.accounts_data ?? []).map((a) => ({
          uid: a.uid, account_id: a.account_id, currency: a.currency, name: a.name,
        }));
    return NextResponse.json({
      accounts: list.map((a) => ({
        externalId: a.uid,
        iban: a.account_id?.iban ?? null,
        currency: a.currency,
        name: a.name ?? a.account_id?.iban ?? `Account ${a.uid.slice(0, 6)}`,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
