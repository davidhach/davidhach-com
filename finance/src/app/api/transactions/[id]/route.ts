/**
 * PATCH /api/transactions/[id]
 *   { categoryId?: string | null, description?, merchant?, note?, ... }
 *
 * Used by the "correct categorisation" UI in /spending. Verifies the txn
 * belongs to the caller before any write.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody, err, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const patchInput = z.object({
  categoryId: z.string().cuid().nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  merchant: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  reviewed: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const data = await parseBody(req, patchInput);

    const before = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Transaction not found");

    if (data.categoryId) {
      const owns = await prisma.category.count({ where: { id: data.categoryId, userId } });
      if (!owns) return err("Category not found", 404);
    }

    const after = await prisma.transaction.update({ where: { id }, data });
    await recordAudit({
      userId, action: "transaction.update", targetType: "Transaction", targetId: id,
      before: { categoryId: before.categoryId }, after: { categoryId: after.categoryId },
      req,
    });
    return ok(after);
  });
}
