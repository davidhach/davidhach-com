/**
 * GET /api/transfers/suggestions
 *
 * Returns up to ~25 detected internal-transfer / card-settlement pairs the
 * user could confirm. Read-only — never modifies data.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { detectTransferSuggestions } from "@/lib/transfer-detect";

export const GET = withAuth(async (userId) => {
  const suggestions = await detectTransferSuggestions(userId);
  return NextResponse.json({ suggestions });
});
