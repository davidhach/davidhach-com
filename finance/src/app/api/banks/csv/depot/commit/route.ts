/**
 * POST /api/banks/csv/depot/commit
 *   { entityId, finAccountId?, rows: [{ isin?, ticker?, name, quantity, avgPrice?, currency }] }
 *
 * For each row:
 *   1. Try to resolve ISIN → ticker via OpenFIGI (cached).
 *   2. Find-or-create the Asset (matched on (userId, externalRef) when ticker
 *      is known; otherwise on (userId, name)).
 *   3. Create a BUY AssetTransaction for the supplied quantity + avgPrice (or
 *      price = 0 when unknown) so cost basis + history start populated.
 *   4. The daily cron will refresh currentValue from the price adapter.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { resolveIsin } from "@/lib/isin-resolver";
import { currency as ccyField } from "@/lib/validation";

const input = z.object({
  entityId: z.string().cuid(),
  finAccountId: z.string().cuid().optional(),
  rows: z.array(z.object({
    isin: z.string().length(12).optional(),
    ticker: z.string().min(1).max(20).optional(),
    name: z.string().min(1).max(200),
    quantity: z.string().regex(/^\d+(\.\d+)?$/),
    avgPrice: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    currency: ccyField,
  })).min(1).max(500),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  const entity = await prisma.entity.findFirst({ where: { id: data.entityId, userId } });
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  if (data.finAccountId) {
    const acc = await prisma.finAccount.count({ where: { id: data.finAccountId, userId } });
    if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  let created = 0, reused = 0, trades = 0;

  for (const r of data.rows) {
    let stooqRef = r.ticker ?? undefined;
    let resolvedName = r.name;
    let symbol: string | undefined = r.isin;
    if (r.isin && !stooqRef) {
      const resolved = await resolveIsin(r.isin);
      if (resolved) {
        stooqRef = resolved.stooqRef;
        resolvedName = r.name || resolved.name;
      }
    }
    // Find-or-create the Asset.
    let asset = stooqRef
      ? await prisma.asset.findFirst({
          where: { userId, priceSource: "stooq", externalRef: stooqRef, archived: false },
        })
      : await prisma.asset.findFirst({ where: { userId, name: resolvedName, archived: false } });

    if (!asset) {
      asset = await prisma.asset.create({
        data: {
          userId,
          entityId: data.entityId,
          finAccountId: data.finAccountId ?? null,
          name: resolvedName,
          assetClass: "STOCKS",
          currency: r.currency,
          priceSource: stooqRef ? "stooq" : null,
          externalRef: stooqRef ?? null,
          symbol: symbol ?? null,
          currentValue: "0",
        },
      });
      created++;
    } else reused++;

    // Record an opening BUY so cost basis is populated. If the position already
    // had buys we just add this one — the position summary will sum them.
    const price = r.avgPrice ? new Decimal(r.avgPrice) : new Decimal(0);
    const qty = new Decimal(r.quantity);
    await prisma.assetTransaction.create({
      data: {
        userId,
        assetId: asset.id,
        kind: "TRANSFER_IN",   // not a real BUY (cash side unknown); preserves quantity without polluting buys count
        date: today,
        quantity: qty.toFixed(10),
        pricePerUnit: price.toFixed(8),
        currency: r.currency,
        note: "depot CSV import",
      },
    });
    // Update the cached quantity + currentValue (cron will overwrite currentValue with real price).
    const existingQty = asset.quantity ? new Decimal(asset.quantity.toString()) : new Decimal(0);
    const newQty = existingQty.plus(qty);
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        quantity: newQty.toFixed(10),
        currentValue: newQty.mul(price).toFixed(2),
      },
    });
    trades++;
  }

  await recordAudit({
    userId, action: "depot.csv.commit", targetType: "Entity", targetId: data.entityId,
    after: { created, reused, trades }, req,
  });
  return NextResponse.json({ created, reused, trades });
});
