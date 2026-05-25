import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { assetInput, valuationInput } from "@/lib/validation";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { refreshAssetPrice } from "@/lib/price-refresh";
import { MANUAL_SOURCE } from "@/lib/price-adapters";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const asset = await prisma.asset.findFirst({
      where: { id, userId },
      include: { valuations: { orderBy: { date: "desc" }, take: 200 }, entity: true, finAccount: true, category: true, tags: { include: { tag: true } } },
    });
    if (!asset) throw new HttpError(404, "Asset not found");
    return ok(asset);
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const data = await parseBody(req, assetInput.partial());

    const before = await prisma.asset.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Asset not found");
    if (before.managedByLinkId) {
      throw new HttpError(409, "This asset is auto-synced from a bank/crypto connection. Disconnect it under Settings → Connections to remove it.");
    }

    const after = await prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({
        where: { id },
        data: {
          ...data,
          // record a new valuation if currentValue changed
        },
      });
      if (data.currentValue && data.currentValue !== before.currentValue.toString()) {
        await tx.valuation.create({
          data: {
            userId,
            assetId: a.id,
            date: new Date(),
            value: data.currentValue,
            quantity: data.quantity ?? a.quantity,
            currency: data.currency ?? a.currency,
            source: "MANUAL",
          },
        });
      }
      return a;
    });

    // If the pricing config changed (or the asset is priced and the user
    // edited quantity), pull a live quote so currentValue reflects today's
    // market — not whatever was cached before.
    const priceConfigChanged =
      (data.priceSource && data.priceSource !== before.priceSource) ||
      (data.externalRef && data.externalRef !== before.externalRef) ||
      (data.quantity && data.quantity !== (before.quantity?.toString() ?? null));
    const isPriced = (data.priceSource ?? before.priceSource) &&
      (data.priceSource ?? before.priceSource) !== MANUAL_SOURCE &&
      (data.externalRef ?? before.externalRef);
    if (isPriced && priceConfigChanged) {
      await refreshAssetPrice(id);
    }

    const fresh = await prisma.asset.findUnique({ where: { id } });
    await recordAudit({ userId, action: "asset.update", targetType: "Asset", targetId: id, before, after: fresh, req });
    return ok(fresh);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const before = await prisma.asset.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Asset not found");
    if (before.managedByLinkId) {
      throw new HttpError(409, "This asset is auto-synced from a bank/crypto connection. Disconnect it under Settings → Connections to remove it.");
    }
    // Soft delete via archive flag — preserves valuations & history.
    const after = await prisma.asset.update({ where: { id }, data: { archived: true } });
    await recordAudit({ userId, action: "asset.archive", targetType: "Asset", targetId: id, before, after, req });
    return ok({ archived: true });
  });
}
