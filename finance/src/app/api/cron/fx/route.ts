import { NextRequest } from "next/server";
import { refreshFxRates } from "@/lib/fx";
import { prisma } from "@/lib/db";
import { takeSnapshot } from "@/lib/net-worth";
import { refreshAllPrices } from "@/lib/price-refresh";
import { runSync } from "@/lib/bank";

/**
 * Daily job. The Hobby plan allows only 2 cron jobs, so this one route does
 * four things in order:
 *   1. Refresh FX rates from exchangerate.host (always).
 *   2. Refresh prices for every asset with a non-manual price source (always).
 *   3. Sync every ACTIVE BankConnection (bank, BTC, ETH).
 *   4. On the 1st of the month (UTC), take a fresh net-worth Snapshot per user.
 *
 * Each step is independent — a failure in one is logged but doesn't abort the
 * others. The standalone /api/cron/snapshot route is kept for manual triggers.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let rates = 0, ratesError: string | null = null;
  try { rates = await refreshFxRates(); }
  catch (e) { ratesError = (e as Error).message; console.error("fx refresh failed", e); }

  let prices = null, pricesError: string | null = null;
  try { prices = await refreshAllPrices(); }
  catch (e) { pricesError = (e as Error).message; console.error("price refresh failed", e); }

  // Bank / crypto sync. Iterate ACTIVE connections, dispatch to the registry.
  // Failures on one connection don't abort the others.
  const banks = { ok: 0, failed: 0, consentExpired: 0, total: 0 };
  const active = await prisma.bankConnection.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  banks.total = active.length;
  for (const c of active) {
    const r = await runSync(c.id);
    if (r.status === "ok") banks.ok++;
    else if (r.status === "consent_expired") banks.consentExpired++;
    else banks.failed++;
  }

  let snapshot: { ok: number; failed: number; total: number } | null = null;
  if (new Date().getUTCDate() === 1) {
    const users = await prisma.user.findMany({ select: { id: true } });
    let ok = 0, failed = 0;
    for (const u of users) {
      try { await takeSnapshot(u.id); ok++; }
      catch (e) { failed++; console.error("snapshot failed for", u.id, e); }
    }
    snapshot = { ok, failed, total: users.length };
  }

  return Response.json({ rates, ratesError, prices, pricesError, banks, snapshot });
}
