/**
 * GET  /api/categories       — list categories (optionally filtered by kind)
 * POST /api/categories       — create a category
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const createInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE"]),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
  parentId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const rows = await prisma.category.findMany({
      where: { userId, ...(kind ? { kind: kind as never } : {}) },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, createInput);
    const cat = await prisma.category.create({ data: { ...data, userId } });
    await recordAudit({ userId, action: "category.create", targetType: "Category", targetId: cat.id, after: cat, req });
    return ok(cat, { status: 201 });
  });
}
