import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, err } from "@/lib/api";
import { takeSnapshot } from "@/lib/net-worth";
import { recordAudit } from "@/lib/audit";
import { subMonths } from "date-fns";
import { buildNetWorthSeries, resolveRange, type Range, type Scope } from "@/lib/series";
import { isSupportedCurrency } from "@/lib/currencies";

/**
 * GET /api/snapshots
 *
 * Two response shapes — picked by which query params are present:
 *
 *   1. Legacy mode (no ?range param): returns the raw Snapshot rows for the
 *      last N months. Used by older clients and the iOS app.
 *        ?months=24 (default)
 *
 *   2. Series mode (?range present): returns a precomputed series suitable for
 *      the dashboard chart, with scope filtering and currency conversion.
 *        ?range=1D|7D|1M|3M|12M|custom
 *        ?from=YYYY-MM-DD&to=YYYY-MM-DD   (custom only)
 *        ?scope=total|entity|assetClass    (default total)
 *        ?scopeId=...                      (required for entity/assetClass)
 *        ?currency=USD|EUR|...             (default = user's displayCurrency)
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const range = url.searchParams.get("range");

    if (!range) {
      // Legacy mode unchanged.
      const months = Math.min(120, Math.max(1, Number(url.searchParams.get("months") ?? 24)));
      const since = subMonths(new Date(), months);
      const snapshots = await prisma.snapshot.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: "asc" },
      });
      return ok(snapshots);
    }

    if (!["1D", "7D", "1M", "3M", "12M", "custom"].includes(range)) {
      return err("Invalid range", 400);
    }
    const scope = (url.searchParams.get("scope") ?? "total") as Scope;
    if (!["total", "entity", "assetClass"].includes(scope)) {
      return err("Invalid scope", 400);
    }
    const scopeId = url.searchParams.get("scopeId");
    if (scope !== "total" && !scopeId) {
      return err("scopeId required for entity/assetClass scope", 400);
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayCurrency: true },
    });
    const ccyParam = url.searchParams.get("currency");
    const currency =
      ccyParam && isSupportedCurrency(ccyParam.toUpperCase()) ? ccyParam.toUpperCase() : user.displayCurrency;

    const { from, to } = resolveRange(
      range as Range,
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );

    const result = await buildNetWorthSeries({ userId, from, to, currency, scope, scopeId });
    return ok(result);
  });
}

/** POST = take a snapshot right now. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    await takeSnapshot(userId);
    await recordAudit({ userId, action: "snapshot.create", targetType: "Snapshot", req });
    const latest = await prisma.snapshot.findFirst({ where: { userId }, orderBy: { date: "desc" } });
    return ok(latest, { status: 201 });
  });
}
