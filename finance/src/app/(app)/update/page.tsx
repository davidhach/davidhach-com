import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BulkUpdateClient } from "./client";

export const dynamic = "force-dynamic";

export default async function UpdatePage() {
  const userId = await requireUserId();
  const [assets, finAccounts] = await Promise.all([
    prisma.asset.findMany({
      where: { userId, archived: false },
      orderBy: [{ assetClass: "asc" }, { name: "asc" }],
      include: { entity: { select: { name: true } } },
    }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
  ]);

  const rows = assets.map((a) => ({
    id: a.id,
    name: a.name,
    entity: a.entity.name,
    assetClass: a.assetClass,
    currency: a.currency,
    currentValue: a.currentValue.toString(),
    quantity: a.quantity?.toString() ?? null,
    priceSource: a.priceSource,
    externalRef: a.externalRef,
    isPriced: !!(a.priceSource && a.priceSource !== "manual" && a.externalRef),
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Update values</h1>
        <p className="text-sm text-muted mt-1">
          For <strong>manual</strong> assets, type a new value. For{" "}
          <strong>auto-priced</strong> assets (stocks, crypto, metals), record a BUY or SELL
          and the system recomputes value from quantity × latest price. Old entries are
          never modified.
        </p>
      </header>
      <BulkUpdateClient assets={rows} finAccounts={finAccounts} />
    </div>
  );
}
