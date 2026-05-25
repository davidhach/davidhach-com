/**
 * POST /api/assets/refresh-all
 * Bulk-refreshes every auto-priced asset for the calling user. The "Refresh all"
 * button on /assets calls this. Same code path as the cron, just scoped.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { refreshAllPricesForUser } from "@/lib/price-refresh";

export const POST = withAuth(async (userId) => {
  const summary = await refreshAllPricesForUser(userId);
  return NextResponse.json(summary);
});
