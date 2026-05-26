/**
 * POST /api/refresh
 *
 * User-triggered "refresh net worth now" — does for one click what the daily
 * cron does, scoped to THIS user's data:
 *   1. Refresh FX rates (global cache, benefits everyone).
 *   2. Refresh prices for every non-manual asset the user owns.
 *   3. Sync every ACTIVE BankConnection the user owns (banks + BTC + ETH).
 *
 * Returns a summary the client renders as "last refreshed" + per-step counts.
 * Auth-gated via withAuth → 401 unauthenticated. Bank/connection rows are
 * filtered by userId before dispatch, so a user can never trigger another
 * user's sync. Each step is independent; one failure logs + continues.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { refreshFxRates } from "@/lib/fx";
import { refreshAllPricesForUser } from "@/lib/price-refresh";
import { runSync } from "@/lib/bank";
import { recordAudit } from "@/lib/audit";

export const POST = withAuth(async (userId, req) => {
  const started = Date.now();

  // Step 1: FX. Failure is non-fatal — convertSafe falls back to cached rates.
  let fxOk = true;
  let fxCount = 0;
  let fxError: string | null = null;
  try { fxCount = await refreshFxRates(); }
  catch (e) { fxOk = false; fxError = (e as Error).message; console.error("refresh: fx failed", e); }

  // Step 2: Prices for THIS user only.
  let prices = { considered: 0, updated: 0, skipped: 0, noQuote: 0, failed: 0 };
  let pricesError: string | null = null;
  try { prices = await refreshAllPricesForUser(userId); }
  catch (e) { pricesError = (e as Error).message; console.error("refresh: prices failed", e); }

  // Step 3: Bank/crypto sync for THIS user's ACTIVE connections only.
  const active = await prisma.bankConnection.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  const banks = { ok: 0, failed: 0, consentExpired: 0, total: active.length };
  for (const c of active) {
    try {
      const r = await runSync(c.id);
      if (r.status === "ok") banks.ok++;
      else if (r.status === "consent_expired") banks.consentExpired++;
      else banks.failed++;
    } catch (e) {
      banks.failed++;
      console.error("refresh: sync failed", c.id, (e as Error).message);
    }
  }

  await recordAudit({
    userId, action: "refresh.manual", targetType: "User", targetId: userId,
    after: { fxOk, fxCount, prices, banks, ms: Date.now() - started }, req,
  });

  return NextResponse.json({
    ok: fxOk && !pricesError,
    fx: { ok: fxOk, count: fxCount, error: fxError },
    prices: { ...prices, error: pricesError },
    banks,
    refreshedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  });
});
