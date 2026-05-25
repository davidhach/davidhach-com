/**
 * PATCH /api/entities/[id] — rename / change kind / change default currency.
 * DELETE /api/entities/[id] — refuses if any non-archived asset, liability,
 *   or finAccount still references this entity. Safer than cascading real
 *   financial data away.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { entityInput } from "@/lib/validation";
import { handle, ok, parseBody, err, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const data = await parseBody(req, entityInput.partial());

    const before = await prisma.entity.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Entity not found");

    const after = await prisma.entity.update({ where: { id }, data });
    await recordAudit({
      userId, action: "entity.update", targetType: "Entity", targetId: id,
      before, after, req,
    });
    return ok(after);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const before = await prisma.entity.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Entity not found");

    // Safety: refuse if anything still references this entity. The user should
    // either re-assign the dependent rows first or archive the entity manually.
    const [assets, liabilities, finAccounts] = await Promise.all([
      prisma.asset.count({ where: { entityId: id, archived: false } }),
      prisma.liability.count({ where: { entityId: id, archived: false } }),
      prisma.finAccount.count({ where: { entityId: id, archived: false } }),
    ]);
    const total = assets + liabilities + finAccounts;
    if (total > 0) {
      return err(
        `Entity still has ${assets} asset(s), ${liabilities} liability/ies, ${finAccounts} account(s). Reassign or archive them first.`,
        409,
        { assets, liabilities, finAccounts },
      );
    }

    await prisma.entity.delete({ where: { id } });
    await recordAudit({
      userId, action: "entity.delete", targetType: "Entity", targetId: id,
      before, req,
    });
    return ok({ deleted: true });
  });
}
