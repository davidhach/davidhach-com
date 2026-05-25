/**
 * Spending overview: GET /api/spending?from=YYYY-MM-DD&to=YYYY-MM-DD&accountId=...
 *
 * Returns:
 *   - byCategory: [{ category, total, count }]
 *   - byMerchant: [{ merchant, total, count }]
 *   - byMonth:    [{ month: "2026-01", spending, income, net }]
 *   - total spending, total income, net cash flow
 *
 * Spending = negative amounts. Income = positive amounts. Convention everywhere.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { convertSafe } from "@/lib/fx";
import { Decimal } from "decimal.js";
import { startOfMonth, subMonths, format } from "date-fns";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    const accountId = url.searchParams.get("accountId");

    const from = fromStr ? new Date(fromStr) : subMonths(startOfMonth(new Date()), 3);
    const to = toStr ? new Date(toStr) : new Date();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ccy = user.displayCurrency;

    const where = {
      userId,
      status: "CLEARED" as const,
      date: { gte: from, lte: to },
      ...(accountId ? { finAccountId: accountId } : {}),
    };
    const txs = await prisma.transaction.findMany({
      where,
      include: { category: true, finAccount: true },
      orderBy: { date: "asc" },
    });

    const byCategory = new Map<string, { name: string; total: Decimal; count: number }>();
    const byMerchant = new Map<string, { merchant: string; total: Decimal; count: number }>();
    const byMonth = new Map<string, { month: string; spending: Decimal; income: Decimal }>();

    let totalSpending = new Decimal(0);
    let totalIncome = new Decimal(0);

    for (const t of txs) {
      const conv = await convertSafe({ amount: t.amount.toString(), from: t.currency, to: ccy, date: t.date });
      if (!conv.ok) continue; // skip rows we can't convert today
      const amount = conv.amount;
      const isOutflow = amount.lt(0);
      const absAmt = amount.abs();
      const monthKey = format(t.date, "yyyy-MM");
      const cur = byMonth.get(monthKey) ?? { month: monthKey, spending: new Decimal(0), income: new Decimal(0) };
      if (isOutflow) { cur.spending = cur.spending.plus(absAmt); totalSpending = totalSpending.plus(absAmt); }
      else           { cur.income = cur.income.plus(absAmt);     totalIncome = totalIncome.plus(absAmt); }
      byMonth.set(monthKey, cur);

      if (isOutflow) {
        const catKey = t.categoryId ?? "uncategorized";
        const catName = t.category?.name ?? "Uncategorized";
        const c = byCategory.get(catKey) ?? { name: catName, total: new Decimal(0), count: 0 };
        c.total = c.total.plus(absAmt); c.count += 1;
        byCategory.set(catKey, c);

        const mKey = t.merchantNormalized ?? t.description.toLowerCase();
        const m = byMerchant.get(mKey) ?? { merchant: t.merchant ?? t.description, total: new Decimal(0), count: 0 };
        m.total = m.total.plus(absAmt); m.count += 1;
        byMerchant.set(mKey, m);
      }
    }

    return ok({
      currency: ccy,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totalSpending: totalSpending.toFixed(2),
      totalIncome: totalIncome.toFixed(2),
      net: totalIncome.minus(totalSpending).toFixed(2),
      byCategory: [...byCategory.values()].sort((a, b) => b.total.cmp(a.total)).map((c) => ({ ...c, total: c.total.toFixed(2) })),
      byMerchant: [...byMerchant.values()].sort((a, b) => b.total.cmp(a.total)).slice(0, 25).map((m) => ({ ...m, total: m.total.toFixed(2) })),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
        month: m.month,
        spending: m.spending.toFixed(2),
        income: m.income.toFixed(2),
        net: m.income.minus(m.spending).toFixed(2),
      })),
      transactionCount: txs.length,
    });
  });
}
