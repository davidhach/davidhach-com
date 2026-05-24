import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { assetInput, valuationInput } from "@/lib/validation";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

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

    await recordAudit({ userId, action: "asset.create", targetType: "Asset", targetId: asset.id, after: asset, req });
    return ok(asset, { status: 201 });
  });
}
