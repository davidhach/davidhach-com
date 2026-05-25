import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { BankRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "positive" | "warning" | "negative" | "neutral"> = {
  ACTIVE: "positive",
  PENDING: "warning",
  CONSENT_EXPIRED: "warning",
  ERROR: "negative",
  REVOKED: "negative",
};

const PROVIDER_LABEL: Record<string, string> = {
  gocardless: "GoCardless (EU bank)",
  btc_address: "Bitcoin address",
  eth_address: "Ethereum address",
  manual_csv: "Manual CSV import",
};

export default async function BanksPage() {
  const userId = await requireUserId();
  const connections = await prisma.bankConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { links: { include: { finAccount: { select: { name: true, currency: true } } } } },
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Connected accounts</h1>
        <Link href="/settings/banks/new"><Button>+ Connect</Button></Link>
      </header>

      <Card>
        <p className="text-xs text-muted mb-4">
          Read-only by design. Ledger can never initiate a transfer from any connected account.
          All syncs run on the daily cron; you can also refresh manually below.
        </p>

        {connections.length === 0 ? (
          <p className="text-sm text-muted">
            No connected accounts yet. Add a bank via GoCardless, a public crypto address, or
            upload a CSV statement.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {connections.map((c) => (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.institutionName}</span>
                    <Badge tone={TONE[c.status] ?? "neutral"}>{c.status.toLowerCase().replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {PROVIDER_LABEL[c.provider] ?? c.provider}
                    {c.links.length > 0 && ` · ${c.links.length} account${c.links.length === 1 ? "" : "s"} linked`}
                    {c.lastSyncedAt && ` · synced ${c.lastSyncedAt.toISOString().slice(0, 10)}`}
                  </div>
                  {c.lastError && <div className="text-xs text-negative mt-0.5">{c.lastError}</div>}
                </div>
                <BankRowActions
                  id={c.id}
                  status={c.status}
                  needsLinking={c.provider === "gocardless" && c.status === "PENDING" && !!c.requisitionId}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
