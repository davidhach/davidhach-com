import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { LinkClient } from "./client";

export const dynamic = "force-dynamic";

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const [conn, finAccounts] = await Promise.all([
    prisma.bankConnection.findFirst({
      where: { id, userId, provider: { in: ["enablebanking", "gocardless"] } },
      select: { id: true, institutionName: true, status: true, provider: true },
    }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
  ]);
  if (!conn) notFound();

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{conn.institutionName}</h1>
      <Card>
        <p className="text-xs text-muted mb-4">
          Pick which detected accounts to link to your Ledger financial accounts. Only linked
          accounts are synced — you can leave others unlinked.
        </p>
        <LinkClient connectionId={conn.id} provider={conn.provider} finAccounts={finAccounts} />
      </Card>
    </div>
  );
}
