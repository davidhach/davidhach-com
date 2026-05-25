/**
 * GET /api/banks/enablebanking/accounts?connectionId=<id>
 *
 * Reads the detected accounts under the session for this connection so the
 * link UI can render them.
 *
 * IMPORTANT shape note (this used to crash on N26):
 *   Enable Banking returns `session.accounts` as an array of bare UID STRINGS.
 *   The detail objects live in `session.accounts_data`. ASPSPs vary in which
 *   array they populate, so we prefer `accounts_data` and fall back to
 *   per-UID detail fetches when only the UID strings are present.
 *
 * Every optional field is guarded — name / iban / currency may be missing on
 * a given account and the UI must still render that row gracefully.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import {
  getSession, getAccountDetails, isConsentExpired, type SessionAccount,
} from "@/lib/bank/enablebanking/client";

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

    // Resolve details. Prefer accounts_data (detail objects). For any UID
    // missing from accounts_data, hit /accounts/{uid}/details. Cap detail
    // fetches at 10 so a misbehaving session can't burn the function budget.
    const detailByUid = new Map<string, SessionAccount>();
    for (const d of session.accounts_data ?? []) {
      if (d?.uid) detailByUid.set(d.uid, d);
    }
    const uids = (session.accounts ?? []).filter((u): u is string => typeof u === "string" && u.length > 0);
    // If accounts is empty but accounts_data has rows, use the UIDs from there.
    const allUids = uids.length > 0 ? uids : [...detailByUid.keys()];

    const MAX_DETAIL_FETCHES = 10;
    let fetched = 0;
    for (const uid of allUids) {
      if (detailByUid.has(uid)) continue;
      if (fetched >= MAX_DETAIL_FETCHES) break;
      fetched++;
      const det = await getAccountDetails(uid).catch(() => null);
      if (det && !isConsentExpired(det)) {
        // /accounts/{uid}/details returns { account: { name, iban, currency, ... } }
        detailByUid.set(uid, {
          uid,
          account_id: det.account?.iban ? { iban: det.account.iban } : undefined,
          currency: det.account?.currency,
          name: det.account?.name,
        });
      } else {
        // Stub so the user can still pick this account; rendering uses guarded defaults.
        detailByUid.set(uid, { uid });
      }
    }

    const accounts = allUids.map((uid) => {
      const d = detailByUid.get(uid) ?? { uid };
      return {
        externalId: uid,
        iban: d.account_id?.iban ?? null,
        currency: d.currency ?? null,
        name:
          d.name?.trim() ||
          d.account_id?.iban ||
          `Account ${(uid ?? "").slice(0, 6) || "???"}`,
        productHint: d.product ?? d.cash_account_type ?? null,
      };
    });
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
