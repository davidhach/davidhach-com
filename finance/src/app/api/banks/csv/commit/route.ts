/**
 * POST /api/banks/csv/commit
 *   { finAccountId, rows: [{ date, amount, currency, description, merchant? }, ...] }
 *
 * Inserts transactions, deduping by (finAccountId, date, amount, merchantNormalized) —
 * same key the bank-sync and OCR pipelines use. Also auto-applies CategoryRules.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { normalizeMerchant } from "@/lib/ocr";
import { isoDate, moneyString, currency as ccyField } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { applyRulesToTransaction } from "@/lib/category-rules";

const input = z.object({
  finAccountId: z.string().cuid(),
  rows: z.array(z.object({
    date: isoDate,
    amount: moneyString,
    currency: ccyField,
    description: z.string().min(1).max(500),
    merchant: z.string().max(200).optional(),
  })).min(1).max(2000),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  const acc = await prisma.finAccount.findFirst({
    where: { id: data.finAccountId, userId },
    select: { id: true },
  });
  if (!acc) return NextResponse.json({ error: "FinAccount not found" }, { status: 404 });

  let inserted = 0;
  let duplicates = 0;
  for (const r of data.rows) {
    const merchantNorm = normalizeMerchant(r.merchant ?? r.description);
    const dateOnly = new Date(r.date);
    const existing = await prisma.transaction.findFirst({
      where: {
        userId, finAccountId: data.finAccountId,
        date: dateOnly,
        amount: new Decimal(r.amount).toFixed(2),
        merchantNormalized: merchantNorm,
      },
      select: { id: true },
    });
    if (existing) { duplicates++; continue; }

    const created = await prisma.transaction.create({
      data: {
        userId,
        finAccountId: data.finAccountId,
        date: dateOnly,
        amount: r.amount,
        currency: r.currency,
        description: r.description,
        merchant: r.merchant ?? null,
        merchantNormalized: merchantNorm,
        status: "CLEARED",
        reviewed: false,
      },
    });
    await applyRulesToTransaction(userId, created.id);
    inserted++;
  }

  await recordAudit({
    userId, action: "bank.csv.commit", targetType: "FinAccount", targetId: data.finAccountId,
    after: { inserted, duplicates }, req,
  });

  return NextResponse.json({ inserted, duplicates });
});
