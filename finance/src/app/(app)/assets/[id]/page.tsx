import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "decimal.js";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";
import { summarisePosition } from "@/lib/asset-positions";
import { AssetHistoryChart } from "./chart";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId },
    include: {
      entity: { select: { name: true } },
      finAccount: { select: { name: true } },
      managedByLink: { include: { connection: { select: { institutionName: true, provider: true } } } },
      transactions: { orderBy: { date: "desc" } },
    },
  });
  if (!asset) notFound();

  const summary = summarisePosition(asset.transactions.map((t) => ({
    kind: t.kind, date: t.date,
    quantity: new Decimal(t.quantity.toString()),
    pricePerUnit: new Decimal(t.pricePerUnit.toString()),
    fee: t.fee ? new Decimal(t.fee.toString()) : null,
  })));

  const currentValue = new Decimal(asset.currentValue.toString());
  const unrealised = summary.quantity.isZero()
    ? new Decimal(0)
    : currentValue.minus(summary.totalCost);

  const managed = !!asset.managedByLinkId;
  const managedSource = managed
    ? asset.managedByLink?.connection.institutionName ?? asset.managedByLink?.connection.provider ?? "connection"
    : null;

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {asset.name}
            {managed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-accent/15 text-fg border border-accent/30 font-normal">
                🔒 auto-synced
              </span>
            )}
          </h1>
          <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-2">
            <Badge>{asset.assetClass.toLowerCase().replace(/_/g, " ")}</Badge>
            {asset.symbol && <span>{asset.symbol}</span>}
            <span>· {asset.entity.name}</span>
            {asset.finAccount && <span>· {asset.finAccount.name}</span>}
            {asset.priceSource && asset.externalRef && (
              <span>· {asset.priceSource}:{asset.externalRef}</span>
            )}
          </div>
          {managed && (
            <p className="text-xs text-muted mt-2 max-w-xl">
              Auto-synced from <strong>{managedSource}</strong>. Value reflects the live balance —
              not editable here. Disconnect under <Link href="/settings/banks" className="underline">Settings → Connections</Link> to remove.
            </p>
          )}
        </div>
        {!managed && (
          <div className="flex gap-2">
            <Link href={`/assets/${asset.id}/edit`}><Button variant="secondary">Edit</Button></Link>
            <Link href="/update"><Button variant="secondary">BUY / SELL</Button></Link>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Value" value={formatMoney(currentValue, asset.currency)} />
        <Stat label="Quantity" value={summary.quantity.toFixed(4)} />
        <Stat label="Avg cost" value={summary.avgCost.isZero() ? "—" : formatMoney(summary.avgCost, asset.currency)} />
        <Stat label="Unrealised P/L" value={formatMoney(unrealised, asset.currency)}
          tone={unrealised.gte(0) ? "positive" : "negative"} />
        <Stat label="Realised P/L" value={formatMoney(summary.realisedPnl, asset.currency)}
          tone={summary.realisedPnl.gte(0) ? "positive" : "negative"} />
      </div>

      {asset.priceSource && asset.externalRef && (
        <Card>
          <h2 className="font-medium text-sm text-muted mb-3">Value over time</h2>
          <AssetHistoryChart assetId={asset.id} currency={asset.currency} />
        </Card>
      )}

      <Card>
        <h2 className="font-medium text-sm text-muted mb-3">Trades</h2>
        {asset.transactions.length === 0 ? (
          <p className="text-sm text-muted">No trades yet. Use Update to record a BUY or SELL.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-left py-2 font-medium">Kind</th>
                <th className="text-right py-2 font-medium">Quantity</th>
                <th className="text-right py-2 font-medium">Price/unit</th>
                <th className="text-right py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {asset.transactions.map((t) => {
                const total = new Decimal(t.quantity.toString()).mul(new Decimal(t.pricePerUnit.toString()));
                return (
                  <tr key={t.id}>
                    <td className="py-2">{t.date.toISOString().slice(0, 10)}</td>
                    <td className="py-2"><Badge>{t.kind}</Badge></td>
                    <td className="py-2 text-right tnum">{new Decimal(t.quantity.toString()).toFixed(4)}</td>
                    <td className="py-2 text-right tnum">{formatMoney(t.pricePerUnit.toString(), t.currency)}</td>
                    <td className="py-2 text-right tnum">{formatMoney(total, t.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-lg font-semibold tnum mt-1 ${
        tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : ""
      }`}>{value}</p>
    </Card>
  );
}
