import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BulkUpdateClient } from "./client";

export const dynamic = "force-dynamic";

export default async function UpdatePage() {
  const userId = await requireUserId();
  const assets = await prisma.asset.findMany({
    where: { userId, archived: false },
    orderBy: [{ assetClass: "asc" }, { name: "asc" }],
    include: { entity: { select: { name: true } } },
  });

  const rows = assets.map((a) => ({
    id: a.id,
    name: a.name,
    entity: a.entity.name,
    assetClass: a.assetClass,
    currency: a.currency,
    currentValue: a.currentValue.toString(),
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Update values</h1>
        <p className="text-sm text-muted mt-1">
          Pick a date, enter new values for any subset of assets, save. Old entries are
          never modified — every save creates a new historical record.
        </p>
      </header>
      <BulkUpdateClient assets={rows} />
    </div>
  );
}
