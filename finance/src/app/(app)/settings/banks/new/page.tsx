import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/primitives";
import { NewBankClient } from "./client";

export const dynamic = "force-dynamic";

export default async function NewBankPage({
  searchParams,
}: { searchParams: Promise<{ finAccountId?: string; mode?: string }> }) {
  const userId = await requireUserId();
  const params = await searchParams;
  const [finAccounts, entities] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true, kind: true, entityId: true },
    }),
    prisma.entity.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
  ]);

  // Validate the pre-selected account belongs to the user before passing through.
  const preselectedAccountId = params.finAccountId && finAccounts.some((a) => a.id === params.finAccountId)
    ? params.finAccountId
    : null;

  // GoCardless: check whether the env is set so we can show a configured/not-configured state.
  const gocardlessConfigured = !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connect a data source</h1>
        <p className="text-sm text-muted mt-1">
          A connection pulls data into one of your <strong>accounts</strong>. Pick how the data
          arrives — by bank API, by public crypto address, or by uploading a CSV.
        </p>
      </header>
      <Card>
        <NewBankClient
          finAccounts={finAccounts}
          entities={entities}
          preselectedAccountId={preselectedAccountId}
          preselectedMode={params.mode ?? null}
          gocardlessConfigured={gocardlessConfigured}
        />
      </Card>
    </div>
  );
}
