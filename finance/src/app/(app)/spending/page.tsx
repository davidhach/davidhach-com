import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/primitives";
import { Decimal } from "decimal.js";
import { subMonths, format, startOfMonth } from "date-fns";
import { formatMoney } from "@/lib/utils";
import { TransactionRecategorize } from "@/components/transaction-recategorize";
import { AllocationPie } from "@/components/allocation-pie";

export const dynamic = "force-dynamic";

export default async function SpendingPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const from = subMonths(startOfMonth(new Date()), 3);

  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, status: "CLEARED", date: { gte: from } },
      include: { category: true, finAccount: true },
      orderBy: { date: "desc" },
    }),
    prisma.category.findMany({
      where: { userId, kind: { in: ["INCOME", "EXPENSE"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);
  const categoryOptions = categories.map((c) => ({
    id: c.id, name: c.name, kind: c.kind as "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY",
  }));

  const byCategory = new Map<string, { name: string; total: Decimal }>();
  const byMerchant = new Map<string, { name: string; total: Decimal; count: number }>();
  const byMonth = new Map<string, { month: string; spending: Decimal; income: Decimal }>();
  let totalSpending = new Decimal(0);
  let totalIncome = new Decimal(0);

  for (const t of txs) {
    const amt = new Decimal(t.amount.toString());
    const monthKey = format(t.date, "yyyy-MM");
    const mEntry = byMonth.get(monthKey) ?? { month: monthKey, spending: new Decimal(0), income: new Decimal(0) };
    if (amt.lt(0)) {
      const abs = amt.abs();
      totalSpending = totalSpending.plus(abs);
      mEntry.spending = mEntry.spending.plus(abs);
      const c = byCategory.get(t.category?.id ?? "uncategorized") ?? { name: t.category?.name ?? "Uncategorized", total: new Decimal(0) };
      c.total = c.total.plus(abs); byCategory.set(t.category?.id ?? "uncategorized", c);
      const m = byMerchant.get(t.merchantNormalized ?? t.description) ?? { name: t.merchant ?? t.description, total: new Decimal(0), count: 0 };
      m.total = m.total.plus(abs); m.count += 1; byMerchant.set(t.merchantNormalized ?? t.description, m);
    } else {
      totalIncome = totalIncome.plus(amt);
      mEntry.income = mEntry.income.plus(amt);
    }
    byMonth.set(monthKey, mEntry);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
        <p className="text-sm text-muted mt-1">Last 3 months · {user.displayCurrency}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><p className="text-xs text-muted">Total spending</p><p className="text-xl font-semibold tnum mt-1 text-negative">{formatMoney(totalSpending, user.displayCurrency)}</p></Card>
        <Card><p className="text-xs text-muted">Total income</p><p className="text-xl font-semibold tnum mt-1 text-positive">{formatMoney(totalIncome, user.displayCurrency)}</p></Card>
        <Card><p className="text-xs text-muted">Net cash flow</p><p className="text-xl font-semibold tnum mt-1">{formatMoney(totalIncome.minus(totalSpending), user.displayCurrency)}</p></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">By category</h2>
          <ul className="divide-y divide-border">
            {[...byCategory.values()].sort((a, b) => b.total.cmp(a.total)).slice(0, 12).map((c) => {
              const pct = c.total.div(totalSpending.isZero() ? 1 : totalSpending).toNumber();
              return (
                <li key={c.name} className="py-2.5">
                  <div className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="tnum font-medium">{formatMoney(c.total, user.displayCurrency)}</span>
                  </div>
                  <div className="h-1 mt-1.5 bg-border/40 rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Top merchants</h2>
          <ul className="divide-y divide-border">
            {[...byMerchant.values()].sort((a, b) => b.total.cmp(a.total)).slice(0, 12).map((m) => (
              <li key={m.name} className="py-2.5 flex justify-between text-sm">
                <div>
                  <div>{m.name}</div>
                  <div className="text-xs text-muted">{m.count}×</div>
                </div>
                <span className="tnum font-medium">{formatMoney(m.total, user.displayCurrency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Spending by category (last 3M)</h2>
          {byCategory.size > 0 ? (
            <AllocationPie
              data={[...byCategory.values()].map((c) => ({ name: c.name, value: c.total.toNumber() }))}
              currency={user.displayCurrency}
            />
          ) : <p className="text-sm text-muted">No spending in range.</p>}
        </Card>
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Transactions</h2>
          <ul className="divide-y divide-border max-h-96 overflow-auto">
            {txs.slice(0, 100).map((t) => {
              const amt = new Decimal(t.amount.toString());
              const isIncome = amt.gt(0);
              return (
                <li key={t.id} className="py-2 grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.merchant ?? t.description}</div>
                    <div className="text-xs text-muted">
                      {t.date.toISOString().slice(0, 10)} · {t.finAccount.name}
                    </div>
                    <div className="mt-1">
                      <TransactionRecategorize
                        txId={t.id}
                        currentCategoryId={t.categoryId}
                        currentCategoryName={t.category?.name ?? null}
                        merchantNormalized={t.merchantNormalized}
                        categories={categoryOptions}
                        isIncome={isIncome}
                      />
                    </div>
                  </div>
                  <div className={`text-right tnum font-medium ${isIncome ? "text-positive" : ""}`}>
                    {formatMoney(t.amount.toString(), t.currency)}
                  </div>
                </li>
              );
            })}
          </ul>
          {txs.length > 100 && (
            <p className="text-xs text-muted mt-2">Showing first 100 of {txs.length}.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-medium text-sm text-muted mb-3">By month</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr><th className="text-left font-medium py-2">Month</th><th className="text-right font-medium py-2">Income</th><th className="text-right font-medium py-2">Spending</th><th className="text-right font-medium py-2">Net</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => (
              <tr key={m.month}>
                <td className="py-2">{m.month}</td>
                <td className="py-2 text-right tnum text-positive">{formatMoney(m.income, user.displayCurrency)}</td>
                <td className="py-2 text-right tnum text-negative">{formatMoney(m.spending, user.displayCurrency)}</td>
                <td className="py-2 text-right tnum">{formatMoney(m.income.minus(m.spending), user.displayCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
