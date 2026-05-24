import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { entityInput } from "@/lib/validation";
import { handle, ok, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const entities = await prisma.entity.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return ok(entities);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, entityInput);
    const entity = await prisma.entity.create({ data: { ...data, userId } });
    await recordAudit({ userId, action: "entity.create", targetType: "Entity", targetId: entity.id, after: entity, req });
    return ok(entity, { status: 201 });
  });
}
