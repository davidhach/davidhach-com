import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { liabilityInput } from "@/lib/validation";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const data = await parseBody(req, liabilityInput.partial());

    const before = await prisma.liability.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Liability not found");

    const after = await prisma.$transaction(async (tx) => {
      const l = await tx.liability.update({
        where: { id },
        data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
      });
      if (data.currentValue && data.currentValue !== before.currentValue.toString()) {
        await tx.valuation.create({
          data: {
            userId,
            liabilityId: l.id,
            date: new Date(),
            value: data.currentValue,
            currency: data.currency ?? l.currency,
            source: "MANUAL",
          },
        });
      }
      return l;
    });

    await recordAudit({ userId, action: "liability.update", targetType: "Liability", targetId: id, before, after, req });
    return ok(after);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const before = await prisma.liability.findFirst({ where: { id, userId } });
    if (!before) throw new HttpError(404, "Liability not found");
    const after = await prisma.liability.update({ where: { id }, data: { archived: true } });
    await recordAudit({ userId, action: "liability.archive", targetType: "Liability", targetId: id, before, after, req });
    return ok({ archived: true });
  });
}
