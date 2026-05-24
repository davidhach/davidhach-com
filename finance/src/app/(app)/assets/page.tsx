import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

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
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <Link href="/assets/new"><Button>Add asset</Button></Link>
      </header>

      {assets.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-muted">No assets yet. Add one to start tracking.</p>
          {entities.length === 0 && (
            <p className="text-xs text-muted mt-2">First, <Link href="/settings" className="underline">create an entity</Link> (personal, company, etc.).</p>
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
                <th className="text-right font-medium px-4 py-2.5">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <Link href={`/assets/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                    {a.symbol && <span className="text-muted ml-2 text-xs">{a.symbol}</span>}
                    {a.finAccount && <div className="text-xs text-muted">{a.finAccount.name}</div>}
                  </td>
                  <td className="px-4 py-3"><Badge>{prettyClass(a.assetClass)}</Badge></td>
                  <td className="px-4 py-3 text-muted">{a.entity.name}</td>
                  <td className="px-4 py-3 text-right tnum font-medium">{formatMoney(a.currentValue.toString(), a.currency)}</td>
                </tr>
              ))}
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
