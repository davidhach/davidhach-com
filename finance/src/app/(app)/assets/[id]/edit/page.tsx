import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AssetForm } from "@/components/asset-form";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const a = await prisma.asset.findFirst({
    where: { id, userId },
    select: {
      id: true, name: true, assetClass: true, currency: true, entityId: true,
      symbol: true, externalRef: true, priceSource: true,
      quantity: true, costBasis: true, currentValue: true, notes: true,
    },
  });
  if (!a) notFound();
  return (
    <AssetForm
      mode="edit"
      initial={{
        id: a.id,
        name: a.name,
        assetClass: a.assetClass,
        currency: a.currency,
        entityId: a.entityId,
        symbol: a.symbol,
        externalRef: a.externalRef,
        priceSource: a.priceSource,
        quantity: a.quantity?.toString() ?? null,
        costBasis: a.costBasis?.toString() ?? null,
        currentValue: a.currentValue.toString(),
        notes: a.notes,
      }}
    />
  );
}
