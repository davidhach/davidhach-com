/**
 * POST /api/categories/seed-defaults
 *
 * Manual trigger for the same seeding that runs automatically on a user's
 * first bank-sync. Idempotent — safe to re-run.
 *
 * Wired from the Settings → Categories panel.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { recordAudit } from "@/lib/audit";
import { seedUserDefaults } from "@/lib/seed-defaults";

export const POST = withAuth(async (userId, req) => {
  const result = await seedUserDefaults(userId);
  await recordAudit({
    userId, action: "categories.seed-defaults",
    after: result, req,
  });
  return NextResponse.json(result);
});
