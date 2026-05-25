/**
 * GET /api/trades/suggestions?days=90
 *
 * Walks the user's recent cash Transactions and returns those whose description
 * looks like a securities order (KAUF/VERKAUF/BUY/SELL …). Skips transactions
 * already promoted to an AssetTransaction (matched via sourceTxId).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { detectTrade } from "@/lib/suggested-trades";

export const GET = withAuth(async (userId, req) => {
  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 90)));
  const since = new Date(); since.setUTCDate(since.getUTCDate() - days);

  const [txs, promoted] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
      include: { finAccount: { select: { id: true, name: true, currency: true, entityId: true } } },
    }),
    prisma.assetTransaction.findMany({
      where: { userId, sourceTxId: { not: null } },
      select: { sourceTxId: true },
    }),
  ]);
  const consumed = new Set(promoted.map((p) => p.sourceTxId!));

  const suggestions = txs
    .filter((t) => !consumed.has(t.id))
    .map((t) => {
      const signal = detectTrade(t.description, t.merchant);
      if (!signal) return null;
      return {
        transactionId: t.id,
        finAccountId: t.finAccountId,
        finAccountName: t.finAccount.name,
        entityId: t.finAccount.entityId,
        date: t.date.toISOString().slice(0, 10),
        amount: t.amount.toString(),
        currency: t.currency,
        description: t.description,
        merchant: t.merchant ?? null,
        signal,
      };
    })
    .filter((x) => x !== null);

  return NextResponse.json(suggestions);
});
