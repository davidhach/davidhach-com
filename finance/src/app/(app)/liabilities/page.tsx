import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LiabilitiesPage() {
  const userId = await requireUserId();
  const liabilities = await prisma.liability.findMany({
    where: { userId, archived: false },
    include: { entity: true, finAccount: true, category: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Liabilities</h1>
        <Link href="/liabilities/new"><Button>Add liability</Button></Link>
      </header>

      {liabilities.length === 0 ? (
        <Card className="text-center py-12"><p className="text-sm text-muted">No liabilities tracked.</p></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg/50 text-xs text-muted">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Liability</th>
                <th className="text-left font-medium px-4 py-2.5">Kind</th>
                <th className="text-left font-medium px-4 py-2.5">Entity</th>
                <th className="text-right font-medium px-4 py-2.5">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {liabilities.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3"><Badge>{l.kind.replace(/_/g, " ")}</Badge></td>
                  <td className="px-4 py-3 text-muted">{l.entity.name}</td>
                  <td className="px-4 py-3 text-right tnum font-medium text-negative">−{formatMoney(l.currentValue.toString(), l.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
