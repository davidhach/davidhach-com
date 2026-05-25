import Link from "next/link";
import { Decimal } from "decimal.js";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";
import { SuggestedTrades } from "@/components/suggested-trades";
import { AssetsActions, AssetRowActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const userId = await requireUserId();
  const [assets, entities] = await Promise.all([
    prisma.asset.findMany({
      where: { userId, archived: false },
      include: { entity: true, finAccount: true, category: true },
      orderBy: [{ assetClass: "asc" }, { name: "asc" }],
    }),
    prisma.entity.findMany({ where: { userId } }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <div className="flex items-center gap-2">
          <AssetsActions hasAssets={assets.length > 0} />
          <Link href="/update"><Button variant="secondary">Update values</Button></Link>
          <Link href="/assets/new"><Button>+ Add asset</Button></Link>
        </div>
      </header>

      <SuggestedTrades
        assets={assets.map((a) => ({
          id: a.id, name: a.name, symbol: a.symbol,
          currency: a.currency, priceSource: a.priceSource, externalRef: a.externalRef,
        }))}
      />

      {assets.length === 0 ? (
        <Card className="text-center py-12 space-y-3">
          <p className="text-sm text-muted">No assets yet.</p>
          {entities.length === 0 ? (
            <>
              <p className="text-xs text-muted">
                First, create an <strong>entity</strong> (e.g. &ldquo;Personal&rdquo; or your company).
                Entities own your assets and let you filter the dashboard.
              </p>
              <Link href="/settings"><Button>Create your first entity</Button></Link>
            </>
          ) : (
            <Link href="/assets/new"><Button>Add your first asset</Button></Link>
          )}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg/50 text-xs text-muted">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Asset</th>
                <th className="text-left font-medium px-4 py-2.5">Class</th>
                <th className="text-left font-medium px-4 py-2.5">Entity</th>
                <th className="text-right font-medium px-4 py-2.5">Cost basis</th>
                <th className="text-right font-medium px-4 py-2.5">Market value</th>
                <th className="text-right font-medium px-4 py-2.5">P/L</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((a) => {
                const value = new Decimal(a.currentValue.toString());
                const cost = a.costBasis ? new Decimal(a.costBasis.toString()) : null;
                const pnl = cost ? value.minus(cost) : null;
                const pnlPct = cost && !cost.isZero()
                  ? pnl!.div(cost).mul(100).toNumber()
                  : null;
                const priceNote =
                  a.notes && a.notes.startsWith("[price] ") ? a.notes.slice(8) : null;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <Link href={`/assets/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                      {a.symbol && <span className="text-muted ml-2 text-xs">{a.symbol}</span>}
                      {a.finAccount && <div className="text-xs text-muted">{a.finAccount.name}</div>}
                      {a.priceSource && a.priceSource !== "manual" && a.externalRef && (
                        <div className="text-xs text-muted">
                          {a.priceSource}:{a.externalRef}
                          {a.quantity && <> · qty {new Decimal(a.quantity.toString()).toFixed(4)}</>}
                          {a.lastPricedAt && <> · {a.lastPricedAt.toISOString().slice(0, 10)}</>}
                        </div>
                      )}
                      {priceNote && (
                        <div className="text-xs text-yellow-700">⚠ {priceNote}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge>{prettyClass(a.assetClass)}</Badge></td>
                    <td className="px-4 py-3 text-muted">{a.entity.name}</td>
                    <td className="px-4 py-3 text-right tnum">
                      {cost ? formatMoney(cost, a.currency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tnum font-medium">
                      {formatMoney(value, a.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tnum">
                      {pnl ? (
                        <span className={pnl.gte(0) ? "text-positive" : "text-negative"}>
                          {pnl.gte(0) ? "+" : ""}{formatMoney(pnl, a.currency)}
                          {pnlPct !== null && <span className="text-xs ml-1 opacity-70">
                            ({pnl.gte(0) ? "+" : ""}{pnlPct.toFixed(1)}%)
                          </span>}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AssetRowActions id={a.id} name={a.name} canRefresh={!!(a.priceSource && a.priceSource !== "manual" && a.externalRef)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function prettyClass(c: string) {
  return c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}
