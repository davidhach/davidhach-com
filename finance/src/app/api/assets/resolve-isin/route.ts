/**
 * POST /api/assets/resolve-isin
 *   { isin: "US0378331005", preferredCurrency?: "EUR" }
 *
 * Returns the resolved ticker + Stooq symbol + name + currency, or 404.
 * The new-asset form calls this on demand and passes the chosen currency so
 * we don't pick a UK pence listing for a EUR asset.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { resolveIsin } from "@/lib/isin-resolver";

const input = z.object({
  isin: z.string().min(12).max(12).toUpperCase(),
  preferredCurrency: z.string().length(3).toUpperCase().optional(),
});

export const POST = withAuth(async (_userId, req) => {
  const data = await parseBody(req, input);
  const result = await resolveIsin(data.isin, { preferredCurrency: data.preferredCurrency });
  if (!result) {
    return NextResponse.json(
      { error: "Could not find a listing that returns a live price. Enter the ticker manually below." },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
});
