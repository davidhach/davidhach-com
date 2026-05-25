/**
 * GET  /api/assets/[id]/transactions — list this asset's BUY/SELL ledger
 * POST /api/assets/[id]/transactions — record a new BUY/SELL/etc.
 *
 * On insert: also adjusts Asset.quantity (and recomputes currentValue = qty × latest price).
 * Optionally creates a matching cash Transaction on the linked finAccount.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { refreshAssetPrice } from "@/lib/price-refresh";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { isoDate, moneyString, currency as currencyField } from "@/lib/validation";
import { summarisePosition } from "@/lib/asset-positions";

const KINDS = ["BUY", "SELL", "DIVIDEND", "SPLIT", "TRANSFER_IN", "TRANSFER_OUT"] as const;

const input = z.object({
  kind: z.enum(KINDS),
  date: isoDate,
  quantity: z.string().regex(/^\d+(\.\d+)?$/, "positive decimal"),
  pricePerUnit: z.string().regex(/^\d+(\.\d+)?$/, "positive decimal"),
  currency: currencyField,
  fee: moneyString.optional(),
  finAccountId: z.string().cuid().optional(),
  note: z.string().max(500).optional(),
  /** When true and finAccountId is set, also writes a matching cash Transaction. */
  recordCashLeg: z.boolean().optional(),
});

function lastSeg(pathname: string, offset = 0): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1 - offset];
}

export const GET = withAuth(async (userId, req) => {
  const url = new URL(req.url);
  // .../assets/<id>/transactions  → assetId is the segment before "transactions"
  const assetId = lastSeg(url.pathname, 1);
  const owns = await prisma.asset.count({ where: { id: assetId, userId } });
  if (!owns) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const rows = await prisma.assetTransaction.findMany({
    where: { userId, assetId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(rows);
});

export const POST = withAuth(async (userId, req) => {
  const url = new URL(req.url);
  const assetId = lastSeg(url.pathname, 1);

  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const data = await parseBody(req, input);

  // Optional cash-leg account must belong to the user.
  if (data.finAccountId) {
    const ok = await prisma.finAccount.count({ where: { id: data.finAccountId, userId } });
    if (!ok) return NextResponse.json({ error: "FinAccount not found" }, { status: 404 });
  }

  const qty = new Decimal(data.quantity);
  const price = new Decimal(data.pricePerUnit);
  if (qty.lte(0)) return NextResponse.json({ error: "quantity must be positive" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const at = await tx.assetTransaction.create({
      data: {
        userId,
        assetId,
        kind: data.kind,
        date: new Date(data.date),
        quantity: data.quantity,
        pricePerUnit: data.pricePerUnit,
        currency: data.currency,
        fee: data.fee ?? null,
        finAccountId: data.finAccountId ?? null,
        note: data.note ?? null,
      },
    });

    // Recompute asset quantity + avg cost from the full ledger (cheaper to do
    // it correctly than to keep an incremental cache in sync).
    const ledger = await tx.assetTransaction.findMany({
      where: { userId, assetId },
      orderBy: { date: "asc" },
    });
    const summary = summarisePosition(ledger.map((r) => ({
      kind: r.kind, date: r.date,
      quantity: new Decimal(r.quantity.toString()),
      pricePerUnit: new Decimal(r.pricePerUnit.toString()),
      fee: r.fee ? new Decimal(r.fee.toString()) : null,
    })));

    // currentValue = qty × latest price if we know one, else qty × this trade's price.
    // (Daily cron will rewrite it next time.)
    const latestPrice = asset.priceSource && asset.externalRef
      ? (await tx.priceHistory.findFirst({
          where: { source: asset.priceSource, externalRef: asset.externalRef },
          orderBy: { date: "desc" },
        }))?.price
      : null;
    const unitPrice = latestPrice ? new Decimal(latestPrice.toString()) : price;
    const newValue = summary.quantity.mul(unitPrice);

    await tx.asset.update({
      where: { id: assetId },
      data: {
        quantity: summary.quantity.toFixed(10),
        costBasis: summary.totalCost.toFixed(2),
        currentValue: newValue.toFixed(2),
      },
    });

    // Optional matching cash leg: writes a Transaction on the linked FinAccount.
    // Negative for BUY (cash out), positive for SELL (cash in).
    if (data.recordCashLeg && data.finAccountId && (data.kind === "BUY" || data.kind === "SELL")) {
      const gross = qty.mul(price);
      const fee = data.fee ? new Decimal(data.fee) : new Decimal(0);
      const cashAmount = data.kind === "BUY" ? gross.plus(fee).neg() : gross.minus(fee);
      await tx.transaction.create({
        data: {
          userId,
          finAccountId: data.finAccountId,
          date: new Date(data.date),
          amount: cashAmount.toFixed(2),
          currency: data.currency,
          description: `${data.kind} ${asset.name} ${qty.toFixed(4)} @ ${price.toFixed(2)}`,
          merchant: asset.name,
          merchantNormalized: asset.name.toLowerCase().replace(/\s+/g, " ").trim(),
          status: "CLEARED",
          reviewed: true,
        },
      });
    }

    return at;
  });

  // After the position recompute, pull a live market price so currentValue
  // reflects today's market — not just qty × this trade's price. Best-effort.
  if (asset.priceSource && asset.priceSource !== "manual" && asset.externalRef) {
    await refreshAssetPrice(assetId);
  }

  await recordAudit({
    userId, action: "asset.transaction.create", targetType: "AssetTransaction", targetId: created.id,
    after: { kind: data.kind, quantity: data.quantity, pricePerUnit: data.pricePerUnit }, req,
  });

  return NextResponse.json(created, { status: 201 });
});
