/**
 * GET /api/banks/gocardless/institutions?country=DE
 * Lists banks the user can connect via GoCardless in the given country.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { listInstitutions } from "@/lib/bank/gocardless/client";

export const GET = withAuth(async (_userId, req) => {
  const country = (new URL(req.url).searchParams.get("country") ?? "DE").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: "country must be a 2-letter ISO code" }, { status: 400 });
  }
  try {
    const list = await listInstitutions(country);
    // Strip noisy fields; the picker only needs id + name + maybe logo.
    return NextResponse.json(list.map((i) => ({
      id: i.id,
      name: i.name,
      bic: i.bic ?? null,
      logo: i.logo ?? null,
      transactionDays: i.transaction_total_days ?? null,
    })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
