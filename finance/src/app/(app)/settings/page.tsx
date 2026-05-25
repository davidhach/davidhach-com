import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";
import { CurrencyPicker } from "@/components/currency-picker";
import { EntitiesManager } from "@/components/entities-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, entities, categoriesCount, lastBackup, bankCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.entity.findMany({ where: { userId } }),
    prisma.category.count({ where: { userId } }),
    prisma.backupMetadata.findFirst({ orderBy: { date: "desc" } }),
    prisma.bankConnection.count({ where: { userId } }),
  ]);

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

      <Card>
        <h2 className="font-medium text-sm mb-3">Entities</h2>
        <p className="text-xs text-muted mb-4">
          An entity owns assets and liabilities. Use them to keep personal, company, or trust
          balances separately and to filter the dashboard by entity.
        </p>
        <EntitiesManager
          initial={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind, currency: e.currency }))}
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
