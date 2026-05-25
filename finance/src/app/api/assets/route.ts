import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { assetInput, valuationInput } from "@/lib/validation";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { refreshAssetPrice } from "@/lib/price-refresh";
import { MANUAL_SOURCE } from "@/lib/price-adapters";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const assets = await prisma.asset.findMany({
      where: { userId, archived: false },
      orderBy: [{ assetClass: "asc" }, { name: "asc" }],
      include: { entity: true, finAccount: true, category: true },
    });
    return ok(assets);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, assetInput);
    const entity = await prisma.entity.findFirst({ where: { id: data.entityId, userId } });
    if (!entity) throw new HttpError(404, "Entity not found");

    const asset = await prisma.$transaction(async (tx) => {
      const a = await tx.asset.create({
        data: {
          ...data,
          userId,
          currentValue: data.currentValue,
          quantity: data.quantity ?? null,
          costBasis: data.costBasis ?? null,
        },
      });
      // Initial valuation seeds the time series.
      await tx.valuation.create({
        data: {
          userId,
          assetId: a.id,
          date: new Date(),
          value: data.currentValue,
          quantity: data.quantity ?? null,
          currency: data.currency,
          source: "MANUAL",
        },
      });
      return a;
    });

    // If this asset is auto-priced, fetch the live quote NOW so the user sees a
    // real market value immediately — don't wait for the daily cron. Best-effort:
    // if the adapter is unreachable we still return the asset (with a note).
    let priceRefresh: Awaited<ReturnType<typeof refreshAssetPrice>> | null = null;
    if (data.priceSource && data.priceSource !== MANUAL_SOURCE && data.externalRef) {
      priceRefresh = await refreshAssetPrice(asset.id);
    }
    const fresh = priceRefresh?.status === "updated"
      ? await prisma.asset.findUnique({ where: { id: asset.id } })
      : asset;

    await recordAudit({ userId, action: "asset.create", targetType: "Asset", targetId: asset.id, after: { ...fresh, priceRefresh }, req });
    return ok({ ...fresh, priceRefresh }, { status: 201 });
  });
}
