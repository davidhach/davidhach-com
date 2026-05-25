/**
 * Price refresh — one asset at a time, or all of them.
 *
 * `refreshAssetPrice(assetId)` is called inline from asset create + every
 * AssetTransaction insert so users see a real market value immediately, not
 * "wait for tomorrow's cron". `refreshAllPrices()` is the cron entry point.
 *
 * Each refresh:
 *   1. Look up adapter via Asset.priceSource (skip if "manual" / unknown).
 *   2. Fetch the latest quote. Null → record `lastError`, leave currentValue alone.
 *   3. On success: write Valuation (source=PRICE_ADAPTER), upsert PriceHistory,
 *      update Asset.currentValue + lastPricedAt + clear any stale error note.
 *
 * Per-asset failures NEVER throw to callers — they get a structured result.
 */
import { Decimal } from "decimal.js";
import { prisma } from "./db";
import { getAdapter, MANUAL_SOURCE } from "./price-adapters";

export interface AssetRefreshResult {
  status: "updated" | "skipped" | "no_quote" | "failed";
  error?: string;
  /** Latest market value after refresh, in the adapter's currency. */
  currentValue?: string;
  currency?: string;
  pricePerUnit?: string;
}

export async function refreshAssetPrice(assetId: string): Promise<AssetRefreshResult> {
  const a = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true, userId: true, currency: true, quantity: true,
      priceSource: true, externalRef: true,
    },
  });
  if (!a) return { status: "failed", error: "Asset not found" };
  if (!a.priceSource || a.priceSource === MANUAL_SOURCE || !a.externalRef) {
    return { status: "skipped" };
  }
  const adapter = getAdapter(a.priceSource);
  if (!adapter) return { status: "skipped", error: `Unknown adapter ${a.priceSource}` };

  try {
    const quote = await adapter.fetch(a.externalRef);
    if (!quote) {
      // Stash a friendly note so the UI can show "price unavailable" instead of
      // silently keeping the old value.
      await prisma.asset.update({
        where: { id: a.id },
        data: { notes: stashError(`No quote from ${a.priceSource} for ${a.externalRef}`) },
      });
      return { status: "no_quote", error: `Adapter returned no data for ${a.externalRef}` };
    }
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const unitValue = a.quantity
      ? new Decimal(a.quantity.toString()).mul(quote.price)
      : quote.price;

    await prisma.$transaction([
      prisma.valuation.create({
        data: {
          userId: a.userId, assetId: a.id, date: today,
          value: unitValue.toFixed(2),
          quantity: a.quantity ?? null,
          currency: quote.currency,
          source: "PRICE_ADAPTER",
          note: `${a.priceSource}:${a.externalRef}`,
        },
      }),
      prisma.asset.update({
        where: { id: a.id },
        data: {
          currentValue: unitValue.toFixed(2),
          currency: quote.currency,
          lastPricedAt: new Date(),
        },
      }),
      prisma.priceHistory.upsert({
        where: { source_externalRef_date: { source: a.priceSource, externalRef: a.externalRef, date: today } },
        create: { source: a.priceSource, externalRef: a.externalRef, date: today,
                  price: quote.price.toFixed(8), currency: quote.currency },
        update: { price: quote.price.toFixed(8), currency: quote.currency, fetchedAt: new Date() },
      }),
    ]);
    return {
      status: "updated",
      currentValue: unitValue.toFixed(2),
      currency: quote.currency,
      pricePerUnit: quote.price.toFixed(8),
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("refreshAssetPrice failed", a.id, msg);
    return { status: "failed", error: msg };
  }
}

// Marker string for error notes; harmless if it stays in Asset.notes (the user
// can clear or edit). Kept short so it doesn't clutter the UI.
function stashError(s: string): string { return `[price] ${s.slice(0, 180)}`; }

// ─── Bulk (cron path) ──────────────────────────────────────────────────────

export interface RefreshSummary {
  considered: number;
  updated: number;
  skipped: number;
  noQuote: number;
  failed: number;
}

export async function refreshAllPrices(): Promise<RefreshSummary> {
  const assets = await prisma.asset.findMany({
    where: { archived: false, priceSource: { not: null }, externalRef: { not: null } },
    select: { id: true },
  });
  const summary: RefreshSummary = {
    considered: assets.length, updated: 0, skipped: 0, noQuote: 0, failed: 0,
  };
  for (const a of assets) {
    const r = await refreshAssetPrice(a.id);
    if (r.status === "updated") summary.updated++;
    else if (r.status === "no_quote") summary.noQuote++;
    else if (r.status === "failed") summary.failed++;
    else summary.skipped++;
  }
  return summary;
}

/** Same as refreshAllPrices, but scoped to a single user. For the manual button. */
export async function refreshAllPricesForUser(userId: string): Promise<RefreshSummary> {
  const assets = await prisma.asset.findMany({
    where: { userId, archived: false, priceSource: { not: null }, externalRef: { not: null } },
    select: { id: true },
  });
  const summary: RefreshSummary = {
    considered: assets.length, updated: 0, skipped: 0, noQuote: 0, failed: 0,
  };
  for (const a of assets) {
    const r = await refreshAssetPrice(a.id);
    if (r.status === "updated") summary.updated++;
    else if (r.status === "no_quote") summary.noQuote++;
    else if (r.status === "failed") summary.failed++;
    else summary.skipped++;
  }
  return summary;
}
