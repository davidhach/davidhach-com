import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { finAccountInput } from "@/lib/validation";
import { handle, ok, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const accounts = await prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ entityId: "asc" }, { name: "asc" }],
      include: { entity: true },
    });
    return ok(accounts);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, finAccountInput);
    // Verify entity ownership
    const entity = await prisma.entity.findFirst({ where: { id: data.entityId, userId } });
    if (!entity) return ok({ error: "Entity not found" }, { status: 404 });
    const account = await prisma.finAccount.create({ data: { ...data, userId } });
    await recordAudit({ userId, action: "account.create", targetType: "FinAccount", targetId: account.id, after: account, req });
    return ok(account, { status: 201 });
  });
}
