import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";
import { CurrencyPicker } from "@/components/currency-picker";
import { EntitiesManager } from "@/components/entities-manager";
import { CategoriesManager } from "@/components/categories-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, entities, categories, lastBackup, bankCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.entity.findMany({ where: { userId } }),
    prisma.category.findMany({
      where: { userId },
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.backupMetadata.findFirst({ orderBy: { date: "desc" } }),
    prisma.bankConnection.count({ where: { userId } }),
  ]);
  const categoriesCount = categories.length;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <h2 className="font-medium text-sm mb-3">Profile</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm items-center">
          <dt className="text-muted">Email</dt><dd>{user?.email}</dd>
          <dt className="text-muted">Display currency</dt>
          <dd><CurrencyPicker initial={user?.displayCurrency ?? "USD"} /></dd>
          <dt className="text-muted">Locale</dt><dd>{user?.locale}</dd>
        </dl>
      </Card>

      <Card id="entities">
        <h2 className="font-medium text-sm mb-3">Entities</h2>
        <p className="text-xs text-muted mb-4">
          An entity is the logical owner of assets and liabilities (e.g. &ldquo;Personal&rdquo;,
          your company, a trust). Most users only need <strong>one</strong>. Each entity has
          accounts, and each account holds assets / connections.
        </p>
        <EntitiesManager
          initial={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, currency: e.currency }))}
        />
      </Card>

      <Card id="categories">
        <h2 className="font-medium text-sm mb-3">Categories</h2>
        <p className="text-xs text-muted mb-4">
          Categories label your transactions. Edit a transaction inline on the{" "}
          <a href="/spending" className="underline">Spending</a> page to auto-create a rule
          that applies to similar future transactions.
        </p>
        <CategoriesManager
          initial={categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind as "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY",
            txCount: c._count.transactions,
          }))}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Connected accounts</h2>
          <a href="/settings/banks" className="text-xs underline text-muted">Manage connections →</a>
        </div>
        <p className="text-xs text-muted">
          {bankCount === 0
            ? "Connect a bank, crypto address, or upload a CSV to import transactions automatically."
            : `${bankCount} connection${bankCount === 1 ? "" : "s"} configured.`}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Security & backup</h2>
          <a href="/settings/security" className="text-xs underline text-muted">Manage password & 2FA →</a>
        </div>
        <ul className="text-sm space-y-2">
          <li className="flex justify-between">
            <span className="text-muted">Password</span>
            {user?.passwordHash
              ? <Badge tone="positive">Set</Badge>
              : <Badge tone="warning">Not set</Badge>}
          </li>
          <li className="flex justify-between">
            <span className="text-muted">Two-factor</span>
            {user?.totpEnabled
              ? <Badge tone="positive">On</Badge>
              : <Badge>Off</Badge>}
          </li>
          <li className="flex justify-between"><span className="text-muted">Categories</span><span>{categoriesCount}</span></li>
          <li className="flex justify-between"><span className="text-muted">Last backup</span><span>{lastBackup?.date.toISOString().slice(0, 10) ?? "—"}</span></li>
          <li className="flex justify-between"><span className="text-muted">Statement encryption</span><Badge tone="positive">AES-256-GCM (envelope)</Badge></li>
        </ul>
      </Card>
    </div>
  );
}
