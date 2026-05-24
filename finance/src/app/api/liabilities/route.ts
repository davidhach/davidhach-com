import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { liabilityInput } from "@/lib/validation";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const liabilities = await prisma.liability.findMany({
      where: { userId, archived: false },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { entity: true, finAccount: true, category: true },
    });
    return ok(liabilities);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, liabilityInput);
    const entity = await prisma.entity.findFirst({ where: { id: data.entityId, userId } });
    if (!entity) throw new HttpError(404, "Entity not found");

    const liability = await prisma.$transaction(async (tx) => {
      const l = await tx.liability.create({
        data: {
          ...data,
          userId,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });
      await tx.valuation.create({
        data: {
          userId,
          liabilityId: l.id,
          date: new Date(),
          value: data.currentValue,
          currency: data.currency,
          source: "MANUAL",
        },
      });
      return l;
    });

    await recordAudit({ userId, action: "liability.create", targetType: "Liability", targetId: liability.id, after: liability, req });
    return ok(liability, { status: 201 });
  });
}
