/**
 * POST /api/assets/resolve-isin
 *   { isin: "US0378331005" }
 *
 * Returns the resolved ticker + Stooq symbol + name, or 404 if no match.
 * The new-asset form calls this on blur of the ISIN field.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { resolveIsin } from "@/lib/isin-resolver";

const input = z.object({
  isin: z.string().min(12).max(12).toUpperCase(),
});

export const POST = withAuth(async (_userId, req) => {
  const data = await parseBody(req, input);
  const result = await resolveIsin(data.isin);
  if (!result) {
    return NextResponse.json(
      { error: "Could not resolve ISIN. Enter the ticker manually below." },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
});
