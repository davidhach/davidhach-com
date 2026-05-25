import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Button } from "@/components/ui/primitives";
import { AccountsManager } from "@/components/accounts-manager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const userId = await requireUserId();
  const [accounts, entities] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      include: {
        entity: { select: { id: true, name: true } },
        _count: { select: { transactions: true, assets: true, liabilities: true, bankLinks: true } },
      },
      orderBy: [{ entity: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.entity.findMany({
      where: { userId },
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (entities.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <Card className="text-center py-12 space-y-3">
          <p className="text-sm text-muted">
            Create an <strong>entity</strong> first — every account belongs to one
            (e.g. &ldquo;Personal&rdquo; or your company). Entities let you keep
            balances separate and filter the dashboard.
          </p>
          <Link href="/settings"><Button>Go to Settings → Entities</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      </header>
      <Card>
        <p className="text-xs text-muted mb-4">
          A <strong>financial account</strong> is one real-world place where money or
          holdings sit — a checking account, a brokerage, a crypto wallet. Every account
          belongs to an <strong>entity</strong>. Once an account exists you can attach a
          bank or crypto <strong>connection</strong> to it under{" "}
          <Link href="/settings/banks" className="underline">Connected accounts</Link>.
        </p>
        <AccountsManager
          initial={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            currency: a.currency,
            institution: a.institution ?? "",
            entityId: a.entityId,
            entityName: a.entity.name,
            counts: a._count,
          }))}
          entities={entities}
        />
      </Card>
    </div>
  );
}
