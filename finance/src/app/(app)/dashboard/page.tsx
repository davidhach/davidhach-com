import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { liveNetWorth } from "@/lib/net-worth";
import { prisma } from "@/lib/db";
import { subMonths } from "date-fns";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { NetWorthChart } from "@/components/net-worth-chart";
import { AllocationPie } from "@/components/allocation-pie";
import { formatMoney, formatPercent, pctChange } from "@/lib/utils";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [breakdown, snapshots, recentTxs] = await Promise.all([
    liveNetWorth(userId),
    prisma.snapshot.findMany({
      where: { userId, date: { gte: subMonths(new Date(), 24) } },
      orderBy: { date: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId, status: "CLEARED" },
      orderBy: { date: "desc" },
      take: 6,
      include: { category: true, finAccount: true },
    }),
  ]);

  const ccy = breakdown.currency;

  // Build the chart series including a "today" point so the line ends at present.
  const chartData = [
    ...snapshots.map((s) => ({ date: s.date.toISOString().slice(0, 10), netWorth: new Decimal(s.netWorth.toString()).toNumber() })),
    { date: new Date().toISOString().slice(0, 10), netWorth: breakdown.netWorth.toNumber() },
  ];

  const oldest = snapshots[0];
  const lastMonth = snapshots[snapshots.length - 1];
  const ytdChange = oldest ? pctChange(new Decimal(oldest.netWorth.toString()), breakdown.netWorth) : 0;
  const momChange = lastMonth ? pctChange(new Decimal(lastMonth.netWorth.toString()), breakdown.netWorth) : 0;

  const allocationData = Object.entries(breakdown.byAssetClass)
    .map(([name, v]) => ({ name: prettyClass(name), value: v.toNumber() }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Net worth</p>
          <h1 className="text-3xl font-semibold tnum tracking-tight">{formatMoney(breakdown.netWorth, ccy)}</h1>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <Badge tone={momChange >= 0 ? "positive" : "negative"}>{formatPercent(momChange)} MoM</Badge>
            <Badge tone={ytdChange >= 0 ? "positive" : "negative"}>{formatPercent(ytdChange)} since {oldest ? oldest.date.toISOString().slice(0, 7) : "—"}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/statements"><Button variant="secondary">Upload statement</Button></Link>
          <Link href="/assets"><Button>Add asset</Button></Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h2 className="font-medium text-sm text-muted mb-3">Net worth over time</h2>
          {chartData.length > 1 ? (
            <NetWorthChart data={chartData} currency={ccy} />
          ) : (
            <EmptyState message="Take your first snapshot to start the time series." cta={<TakeSnapshotButton />} />
          )}
        </Card>

        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Allocation</h2>
          {allocationData.length ? (
            <>
              <AllocationPie data={allocationData} currency={ccy} />
              <ul className="text-xs mt-3 space-y-1">
                {allocationData.map((a) => (
                  <li key={a.name} className="flex justify-between tnum">
                    <span>{a.name}</span>
                    <span className="text-muted">{((a.value / breakdown.totalAssets.toNumber()) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState message="Add an asset to see your allocation." />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Assets" value={formatMoney(breakdown.totalAssets, ccy)} sub={`${breakdown.assetCount} holdings`} />
        <Stat label="Liabilities" value={formatMoney(breakdown.totalLiabilities, ccy)} sub={`${breakdown.liabilityCount} accounts`} />
        <Stat label="Cash & equivalents" value={formatMoney(breakdown.byAssetClass.CASH ?? new Decimal(0), ccy)} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm text-muted">Recent transactions</h2>
          <Link href="/spending" className="text-xs text-muted hover:text-fg">View all →</Link>
        </div>
        {recentTxs.length === 0 ? (
          <EmptyState message="Upload a statement screenshot to populate transactions." />
        ) : (
          <ul className="divide-y divide-border">
            {recentTxs.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{t.merchant ?? t.description}</div>
                  <div className="text-xs text-muted">{t.date.toISOString().slice(0, 10)} · {t.category?.name ?? "Uncategorized"} · {t.finAccount.name}</div>
                </div>
                <div className={`tnum font-medium ${new Decimal(t.amount.toString()).lt(0) ? "" : "text-positive"}`}>
                  {formatMoney(t.amount.toString(), t.currency)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tnum mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </Card>
  );
}

function EmptyState({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div className="text-center py-10">
      <p className="text-sm text-muted">{message}</p>
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  );
}

function TakeSnapshotButton() {
  return (
    <form action="/api/snapshots" method="post">
      <Button type="submit" variant="secondary">Take a snapshot</Button>
    </form>
  );
}

function prettyClass(c: string): string {
  return c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}
