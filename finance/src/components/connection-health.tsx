import Link from "next/link";
import { prisma } from "@/lib/db";
import { ConnectionHealthActions } from "./connection-health-actions";

const STALE_AFTER_DAYS = 3;

interface UnhealthyRow {
  id: string;
  institutionName: string;
  provider: string;
  status: string;
  reason: string;
  lastSyncedAt: string | null;
  canReconnect: boolean;   // Enable Banking only — has institutionId for restart
}

/** Server component. Pulls every connection for this user and surfaces the ones
 *  that need attention (ERROR, CONSENT_EXPIRED, STALE = ACTIVE but lastSyncedAt
 *  older than STALE_AFTER_DAYS). Renders nothing when everything is healthy. */
export async function ConnectionHealthBanner({ userId }: { userId: string }) {
  const conns = await prisma.bankConnection.findMany({
    where: { userId },
    select: {
      id: true, institutionName: true, provider: true, status: true,
      lastSyncedAt: true, lastError: true, institutionId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  if (conns.length === 0) return null;

  const now = Date.now();
  const stale = STALE_AFTER_DAYS * 24 * 3600 * 1000;
  const unhealthy: UnhealthyRow[] = [];

  for (const c of conns) {
    // Sync-OK-with-warnings is still ACTIVE; don't pester unless really old.
    const lastMs = c.lastSyncedAt ? c.lastSyncedAt.getTime() : 0;
    const isStale = c.status === "ACTIVE" && (!c.lastSyncedAt || now - lastMs > stale);
    const reason =
      c.status === "CONSENT_EXPIRED" ? "Bank consent expired — re-consent at your bank to keep syncing." :
      c.status === "ERROR"           ? `Last sync failed${c.lastError ? `: ${c.lastError.slice(0, 200)}` : ""}.` :
      isStale                        ? `No successful sync in ${formatDays(now - lastMs)}.` :
      null;
    if (!reason) continue;
    unhealthy.push({
      id: c.id,
      institutionName: c.institutionName,
      provider: c.provider,
      status: isStale ? "STALE" : c.status,
      reason,
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString().slice(0, 10) : null,
      canReconnect: c.provider === "enablebanking" && !!c.institutionId,
    });
  }

  if (unhealthy.length === 0) return null;

  return (
    <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">
          {unhealthy.length === 1
            ? "1 connection needs attention"
            : `${unhealthy.length} connections need attention`}
        </h2>
        <Link href="/settings/banks" className="text-xs underline text-muted hover:text-fg">
          Manage all →
        </Link>
      </div>
      <ul className="divide-y divide-border bg-card rounded-lg border border-border">
        {unhealthy.map((u) => (
          <li key={u.id} className="p-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{u.institutionName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${tone(u.status)}`}>
                  {u.status.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              <div className="text-xs text-muted mt-0.5">{u.reason}</div>
            </div>
            <ConnectionHealthActions id={u.id} canReconnect={u.canReconnect} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function tone(status: string): string {
  if (status === "STALE") return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  if (status === "CONSENT_EXPIRED") return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  return "bg-negative/15 text-negative border-negative/30";
}

function formatDays(ms: number): string {
  const days = Math.round(ms / 86400000);
  if (days <= 1) return "a day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}
