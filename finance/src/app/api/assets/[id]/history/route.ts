/**
 * GET /api/assets/[id]/history?days=365
 *
 * Returns the asset's value series. For quantity-based price-adapter assets,
 * value[day] = quantity_on_day × price_on_day (from PriceHistory). For manual
 * assets, returns the raw Valuation rows.
 */
import { NextResponse } from "next/server";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";

export const GET = withAuth(async (userId, req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").filter(Boolean).at(-2)!;
  const days = Math.min(3650, Math.max(7, Number(url.searchParams.get("days") ?? 365)));

  const asset = await prisma.asset.findFirst({
    where: { id, userId },
    select: {
      id: true, currency: true, priceSource: true, externalRef: true,
      currentValue: true, quantity: true,
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(); since.setUTCDate(since.getUTCDate() - days);

  // Quantity-over-time from AssetTransaction ledger.
  const txns = await prisma.assetTransaction.findMany({
    where: { userId, assetId: id },
    orderBy: { date: "asc" },
  });

  // Price-over-time: PriceHistory if adapter-backed, else fall back to Valuation rows.
  let priceSeries: Array<{ date: Date; price: Decimal; currency: string }> = [];
  if (asset.priceSource && asset.externalRef && asset.priceSource !== "manual") {
    const rows = await prisma.priceHistory.findMany({
      where: {
        source: asset.priceSource,
        externalRef: asset.externalRef,
        date: { gte: since },
      },
      orderBy: { date: "asc" },
    });
    priceSeries = rows.map((r) => ({
      date: r.date, price: new Decimal(r.price.toString()), currency: r.currency,
    }));
  }

  const series: Array<{ date: string; value: number; quantity: number; price?: number }> = [];

  if (priceSeries.length > 0) {
    // Daily resolution from price history × ledger-derived quantity.
    for (const p of priceSeries) {
      const qtyAt = quantityAt(txns, p.date);
      series.push({
        date: p.date.toISOString().slice(0, 10),
        value: qtyAt.mul(p.price).toNumber(),
        quantity: qtyAt.toNumber(),
        price: p.price.toNumber(),
      });
    }
  } else {
    // Manual assets: walk Valuation rows directly.
    const vals = await prisma.valuation.findMany({
      where: { userId, assetId: id, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    for (const v of vals) {
      series.push({
        date: v.date.toISOString().slice(0, 10),
        value: new Decimal(v.value.toString()).toNumber(),
        quantity: v.quantity ? new Decimal(v.quantity.toString()).toNumber() : 0,
      });
    }
  }

  return NextResponse.json({
    currency: asset.currency,
    series,
    latest: { value: new Decimal(asset.currentValue.toString()).toNumber() },
  });
});

function quantityAt(txns: Array<{ kind: string; date: Date; quantity: { toString(): string } }>, at: Date): Decimal {
  let q = new Decimal(0);
  for (const t of txns) {
    if (t.date > at) break;
    const v = new Decimal(t.quantity.toString());
    if (t.kind === "BUY" || t.kind === "TRANSFER_IN" || t.kind === "DIVIDEND" || t.kind === "SPLIT") q = q.plus(v);
    else if (t.kind === "SELL" || t.kind === "TRANSFER_OUT") q = q.minus(v);
  }
  return q;
}
