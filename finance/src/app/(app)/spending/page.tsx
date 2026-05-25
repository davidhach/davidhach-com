import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";
import { Decimal } from "decimal.js";
import { subMonths, format, startOfMonth, startOfYear } from "date-fns";
import { formatMoney } from "@/lib/utils";
import { TransactionRecategorize } from "@/components/transaction-recategorize";
import { AllocationPie } from "@/components/allocation-pie";
import { EntityFilter } from "@/components/entity-filter";
import { AccountFilter } from "@/components/account-filter";
import { PeriodFilter, type PeriodPreset } from "@/components/period-filter";
import { TransferSuggestions } from "@/components/transfer-suggestions";
import { TransferLine } from "@/components/transfer-line";

export const dynamic = "force-dynamic";

const PRESETS: PeriodPreset[] = ["1m", "3m", "6m", "12m", "ytd", "custom"];

function rangeFor(period: PeriodPreset, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === "ytd") return { from: startOfYear(now), to: now };
  if (period === "custom" && customFrom && customTo) {
    return { from: new Date(customFrom), to: new Date(customTo) };
  }
  const months = period === "1m" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : period === "12m" ? 12 : 3;
  return { from: subMonths(startOfMonth(now), months), to: now };
}

export default async function SpendingPage({
  searchParams,
}: { searchParams: Promise<{ entity?: string; account?: string; period?: string; from?: string; to?: string }> }) {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const params = await searchParams;

  // Whitelist filter values against the user's own rows. Never trust the URL.
  const [entities, finAccounts] = await Promise.all([
    prisma.entity.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      select: { id: true, name: true, entityId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const entityId = params.entity && entities.some((e) => e.id === params.entity) ? params.entity : null;
  const accountId = params.account && finAccounts.some((a) => a.id === params.account &&
    (!entityId || a.entityId === entityId)) ? params.account : null;
  const period: PeriodPreset = PRESETS.includes(params.period as PeriodPreset)
    ? (params.period as PeriodPreset)
    : "3m";
  const { from, to } = rangeFor(period, params.from, params.to);

  const txWhere = {
    userId,
    status: "CLEARED" as const,
    date: { gte: from, lte: to },
    ...(accountId ? { finAccountId: accountId } : entityId ? { finAccount: { entityId } } : {}),
  };

  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: txWhere,
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

  // ── Aggregation ───────────────────────────────────────────────────────────
  // Transfers + card settlements are EXCLUDED from spending/income totals so
  // we don't double-count moving money around. They still appear in a separate
  // "Transfers" section below for visibility.
  const byCategory  = new Map<string, { name: string; total: Decimal }>();
  const byIncomeCat = new Map<string, { name: string; total: Decimal }>();
  const byMerchant  = new Map<string, { name: string; total: Decimal; count: number }>();
  const byMonth     = new Map<string, { month: string; spending: Decimal; income: Decimal }>();
  let totalSpending = new Decimal(0);
  let totalIncome   = new Decimal(0);

  const spendList:  typeof txs = [];
  const incomeList: typeof txs = [];
  const transferList: typeof txs = [];

  for (const t of txs) {
    if (t.excludeFromTotals || t.transferKind) {
      transferList.push(t);
      continue;
    }
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
      spendList.push(t);
    } else {
      totalIncome = totalIncome.plus(amt);
      mEntry.income = mEntry.income.plus(amt);
      const c = byIncomeCat.get(t.category?.id ?? "uncategorized") ?? { name: t.category?.name ?? "Uncategorized", total: new Decimal(0) };
      c.total = c.total.plus(amt); byIncomeCat.set(t.category?.id ?? "uncategorized", c);
      incomeList.push(t);
    }
    byMonth.set(monthKey, mEntry);
  }

  const accountsForFilter = entityId ? finAccounts.filter((a) => a.entityId === entityId) : finAccounts;
  const activeScopeLabel = [
    entityId && entities.find((e) => e.id === entityId)?.name,
    accountId && finAccounts.find((a) => a.id === accountId)?.name,
  ].filter(Boolean).join(" · ") || "All accounts";
  const periodLabel =
    period === "ytd" ? "Year to date" :
    period === "custom" ? `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}` :
    `Last ${period.toUpperCase()}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spending & income</h1>
          <p className="text-sm text-muted mt-1">{periodLabel} · {user.displayCurrency} · {activeScopeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter current={period} customFrom={params.from} customTo={params.to} />
          <EntityFilter entities={entities} current={entityId} />
          <AccountFilter accounts={accountsForFilter} current={accountId} />
        </div>
      </header>

      <TransferSuggestions />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><p className="text-xs text-muted">Total spending</p><p className="text-xl font-semibold tnum mt-1 text-negative">{formatMoney(totalSpending, user.displayCurrency)}</p></Card>
        <Card><p className="text-xs text-muted">Total income</p><p className="text-xl font-semibold tnum mt-1 text-positive">{formatMoney(totalIncome, user.displayCurrency)}</p></Card>
        <Card><p className="text-xs text-muted">Net cash flow</p><p className="text-xl font-semibold tnum mt-1">{formatMoney(totalIncome.minus(totalSpending), user.displayCurrency)}</p></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Spending by category</h2>
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
            {byCategory.size === 0 && <li className="text-sm text-muted py-2">No spending in range.</li>}
          </ul>
        </Card>

        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Income by category</h2>
          <ul className="divide-y divide-border">
            {[...byIncomeCat.values()].sort((a, b) => b.total.cmp(a.total)).slice(0, 12).map((c) => {
              const pct = c.total.div(totalIncome.isZero() ? 1 : totalIncome).toNumber();
              return (
                <li key={c.name} className="py-2.5">
                  <div className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="tnum font-medium text-positive">{formatMoney(c.total, user.displayCurrency)}</span>
                  </div>
                  <div className="h-1 mt-1.5 bg-border/40 rounded-full overflow-hidden">
                    <div className="h-full bg-positive" style={{ width: `${pct * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {byIncomeCat.size === 0 && <li className="text-sm text-muted py-2">No income in range.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Spending transactions</h2>
          <TxList txs={spendList} categories={categoryOptions} kind="spend" displayCurrency={user.displayCurrency} />
        </Card>
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Income transactions</h2>
          <TxList txs={incomeList} categories={categoryOptions} kind="income" displayCurrency={user.displayCurrency} />
        </Card>
      </div>

      {transferList.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm text-muted">Transfers / card payments (excluded from totals)</h2>
            <Badge>{transferList.length}</Badge>
          </div>
          <ul className="divide-y divide-border max-h-72 overflow-auto">
            {transferList.slice(0, 60).map((t) => (
              <TransferLine key={t.id}
                id={t.id}
                date={t.date.toISOString().slice(0, 10)}
                accountName={t.finAccount.name}
                description={t.merchant ?? t.description}
                amountDisplay={formatMoney(t.amount.toString(), t.currency)}
                kindLabel={t.transferKind?.toLowerCase().replace("_", " ") ?? "transfer"} />
            ))}
          </ul>
        </Card>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Spending by category</h2>
          {byCategory.size > 0 ? (
            <AllocationPie
              data={[...byCategory.values()].map((c) => ({ name: c.name, value: c.total.toNumber() }))}
              currency={user.displayCurrency}
            />
          ) : <p className="text-sm text-muted">No spending in range.</p>}
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
            {byMerchant.size === 0 && <li className="text-sm text-muted py-2">No merchants in range.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

interface TxRow {
  id: string;
  date: Date;
  amount: { toString(): string };
  currency: string;
  description: string;
  merchant: string | null;
  merchantNormalized: string | null;
  categoryId: string | null;
  category: { name: string } | null;
  finAccount: { name: string };
}

// Small inline component reused for the two TX lists.
function TxList({
  txs, categories, kind, displayCurrency,
}: {
  txs: TxRow[];
  categories: Array<{ id: string; name: string; kind: "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY" }>;
  kind: "spend" | "income";
  displayCurrency: string;
}) {
  if (txs.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">No {kind === "spend" ? "spending" : "income"} in range.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-border max-h-96 overflow-auto">
        {txs.slice(0, 100).map((t) => (
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
                  categories={categories}
                  isIncome={kind === "income"}
                />
              </div>
            </div>
            <div className={`text-right tnum font-medium ${kind === "income" ? "text-positive" : ""}`}>
              {formatMoney(t.amount.toString(), t.currency)}
            </div>
          </li>
        ))}
      </ul>
      {txs.length > 100 && (
        <p className="text-xs text-muted mt-2">Showing first 100 of {txs.length}. Use {displayCurrency === "ALL" ? "" : "the"} filters to narrow.</p>
      )}
    </>
  );
}
