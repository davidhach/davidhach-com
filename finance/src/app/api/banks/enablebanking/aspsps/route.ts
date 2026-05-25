/**
 * GET /api/banks/enablebanking/aspsps?country=DE
 * Lists the banks (ASPSPs) the user can connect via Enable Banking.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { listAspsps, isConfigured } from "@/lib/bank/enablebanking/client";

export const GET = withAuth(async (_userId, req) => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Enable Banking not configured. Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY." },
      { status: 503 },
    );
  }
  const country = (new URL(req.url).searchParams.get("country") ?? "DE").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: "country must be a 2-letter ISO code" }, { status: 400 });
  }
  try {
    const list = await listAspsps(country);
    return NextResponse.json(list.map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo ?? null,
      psuTypes: a.psu_types ?? [],
      maxConsentDays: a.maximum_consent_validity ?? null,
    })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
