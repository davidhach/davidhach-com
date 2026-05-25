/**
 * POST /api/trades/confirm
 *   { transactionId, assetId, kind, quantity, pricePerUnit, currency, date? }
 *
 * Promotes a suggested cash-transaction trade into a real AssetTransaction.
 * Sets sourceTxId so the same Transaction won't be re-suggested.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { isoDate, currency as ccyField } from "@/lib/validation";
import { summarisePosition } from "@/lib/asset-positions";

const input = z.object({
  transactionId: z.string().cuid(),
  assetId: z.string().cuid(),
  kind: z.enum(["BUY", "SELL"]),
  quantity: z.string().regex(/^\d+(\.\d+)?$/),
  pricePerUnit: z.string().regex(/^\d+(\.\d+)?$/),
  currency: ccyField,
  date: isoDate.optional(),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  const [tx, asset] = await Promise.all([
    prisma.transaction.findFirst({ where: { id: data.transactionId, userId } }),
    prisma.asset.findFirst({ where: { id: data.assetId, userId } }),
  ]);
  if (!tx)    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  // Refuse confirms against an auto-synced asset. The wallet balance is the
  // source of truth for managed CRYPTO/CASH; running the position recompute
  // here would overwrite Asset.quantity with the AssetTransaction ledger and
  // zero out the real wallet reading until the next sync.
  if (asset.managedByLinkId) {
    return NextResponse.json(
      { error: "This asset is auto-synced from a connection — buy/sell at the source, Ledger only reads." },
      { status: 409 },
    );
  }

  const date = data.date ? new Date(data.date) : tx.date;

  const created = await prisma.$transaction(async (db) => {
    const at = await db.assetTransaction.create({
      data: {
        userId,
        assetId: data.assetId,
        kind: data.kind,
        date,
        quantity: data.quantity,
        pricePerUnit: data.pricePerUnit,
        currency: data.currency,
        finAccountId: tx.finAccountId,
        sourceTxId: tx.id,
        note: `Confirmed from txn "${tx.description.slice(0, 80)}"`,
      },
    });

    // Recompute asset quantity + cost basis.
    const ledger = await db.assetTransaction.findMany({
      where: { userId, assetId: data.assetId },
      orderBy: { date: "asc" },
    });
    const summary = summarisePosition(ledger.map((r) => ({
      kind: r.kind, date: r.date,
      quantity: new Decimal(r.quantity.toString()),
      pricePerUnit: new Decimal(r.pricePerUnit.toString()),
      fee: r.fee ? new Decimal(r.fee.toString()) : null,
    })));

    const latest = asset.priceSource && asset.externalRef
      ? (await db.priceHistory.findFirst({
          where: { source: asset.priceSource, externalRef: asset.externalRef },
          orderBy: { date: "desc" },
        }))?.price
      : null;
    const unitPrice = latest ? new Decimal(latest.toString()) : new Decimal(data.pricePerUnit);
    await db.asset.update({
      where: { id: data.assetId },
      data: {
        quantity: summary.quantity.toFixed(10),
        costBasis: summary.totalCost.toFixed(2),
        currentValue: summary.quantity.mul(unitPrice).toFixed(2),
      },
    });
    return at;
  });

  await recordAudit({
    userId, action: "trade.suggestion.confirm", targetType: "AssetTransaction", targetId: created.id,
    after: { from: tx.id, kind: data.kind, assetId: data.assetId }, req,
  });

  return NextResponse.json(created, { status: 201 });
});
