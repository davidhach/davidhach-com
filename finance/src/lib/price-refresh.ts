/**
 * Refresh prices for all assets that have a non-manual price source.
 *
 * For each refreshable asset:
 *   1. Call its adapter to fetch the latest quote.
 *   2. If the adapter returns null, skip (no Valuation row; lastPricedAt
 *      unchanged so we'll retry on the next cron).
 *   3. Otherwise: insert a Valuation (source=PRICE_ADAPTER) for today,
 *      update Asset.currentValue + lastPricedAt.
 *
 * Failures on one asset do NOT abort the others.
 *
 * Designed to be folded into the existing daily FX cron so we stay under the
 * Vercel Hobby 2-cron limit.
 */
import { Decimal } from "decimal.js";
import { prisma } from "./db";
import { getAdapter, MANUAL_SOURCE } from "./price-adapters";

export interface RefreshSummary {
  considered: number;
  updated: number;
  skipped: number;
  failed: number;
}

export async function refreshAllPrices(): Promise<RefreshSummary> {
  const assets = await prisma.asset.findMany({
    where: {
      archived: false,
      priceSource: { not: null },
      externalRef: { not: null },
    },
    select: {
      id: true, userId: true, currency: true, quantity: true, currentValue: true,
      priceSource: true, externalRef: true,
    },
  });

  const summary: RefreshSummary = { considered: assets.length, updated: 0, skipped: 0, failed: 0 };
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);

  for (const a of assets) {
    if (!a.priceSource || a.priceSource === MANUAL_SOURCE || !a.externalRef) {
      summary.skipped++;
      continue;
    }
    const adapter = getAdapter(a.priceSource);
    if (!adapter) { summary.skipped++; continue; }

    try {
      const quote = await adapter.fetch(a.externalRef);
      if (!quote) { summary.skipped++; continue; }

      // The fetched price is per-unit in the adapter's native currency. The
      // asset stores `currency` (the user's chosen reporting currency for the
      // line item) and an optional `quantity`. If quantity is set, total value
      // = price * quantity in the adapter's currency. If not, treat price as
      // the aggregate value already (typical for "1 share of a private fund").
      const unitValue = a.quantity ? new Decimal(a.quantity.toString()).mul(quote.price) : quote.price;

      await prisma.$transaction([
        prisma.valuation.create({
          data: {
            userId: a.userId,
            assetId: a.id,
            date: today,
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
        // Also persist the per-unit price in PriceHistory keyed on (source, ref, date).
        // Lets series.ts reconstruct historical value = quantity × historical price
        // without recomputing every Valuation row.
        prisma.priceHistory.upsert({
          where: {
            source_externalRef_date: {
              source: a.priceSource, externalRef: a.externalRef, date: today,
            },
          },
          create: {
            source: a.priceSource, externalRef: a.externalRef, date: today,
            price: quote.price.toFixed(8), currency: quote.currency,
          },
          update: {
            price: quote.price.toFixed(8), currency: quote.currency, fetchedAt: new Date(),
          },
        }),
      ]);
      summary.updated++;
    } catch (e) {
      summary.failed++;
      console.error("price refresh failed for asset", a.id, e);
    }
  }

  return summary;
}
