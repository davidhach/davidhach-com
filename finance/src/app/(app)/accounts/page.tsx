import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const userId = await requireUserId();
  const accounts = await prisma.finAccount.findMany({
    where: { userId, archived: false },
    include: { entity: true, _count: { select: { transactions: true } } },
    orderBy: [{ entity: { name: "asc" } }, { name: "asc" }],
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      {accounts.length === 0 ? (
        <Card className="text-center py-12"><p className="text-sm text-muted">No accounts yet. Add an entity in Settings and accounts will follow.</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-start justify-between">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted">{a.institution ?? "—"} · {a.entity.name}</div>
                <div className="text-xs text-muted mt-1">{a._count.transactions} transactions</div>
              </div>
              <Badge>{a.kind.replace(/_/g, " ")}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
