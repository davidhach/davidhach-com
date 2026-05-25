import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, entities, categoriesCount, lastBackup] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.entity.findMany({ where: { userId } }),
    prisma.category.count({ where: { userId } }),
    prisma.backupMetadata.findFirst({ orderBy: { date: "desc" } }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <h2 className="font-medium text-sm mb-3">Profile</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">Email</dt><dd>{user?.email}</dd>
          <dt className="text-muted">Display currency</dt><dd>{user?.displayCurrency}</dd>
          <dt className="text-muted">Locale</dt><dd>{user?.locale}</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="font-medium text-sm mb-3">Entities</h2>
        {entities.length === 0 ? (
          <p className="text-sm text-muted">No entities yet. Create one with `POST /api/entities`.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entities.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{e.name}</div>
                  <div className="text-xs text-muted">{e.kind} · {e.currency}</div>
                </div>
                <Badge>{e.kind.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
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
