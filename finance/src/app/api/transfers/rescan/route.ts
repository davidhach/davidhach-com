/**
 * POST /api/transfers/rescan
 *
 * Runs every TransferRule + connection-derived self-transfer pattern across
 * up to 5,000 of the user's un-flagged transactions and marks matches as
 * TRANSFER/excluded. Idempotent. Used from the Connection health banner +
 * Settings.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { recordAudit } from "@/lib/audit";
import { backfillAll } from "@/lib/own-account-transfers";

export const POST = withAuth(async (userId, req) => {
  const updated = await backfillAll(userId);
  await recordAudit({ userId, action: "transfer.rescan", after: { updated }, req });
  return NextResponse.json({ updated });
});
