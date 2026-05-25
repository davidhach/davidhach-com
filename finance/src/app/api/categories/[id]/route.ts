/**
 * PATCH  /api/categories/[id] — rename / change color / icon / kind
 * DELETE /api/categories/[id] — deletes. Transactions referencing it are set
 *   to categoryId = null (via the Prisma SetNull cascade rule on the relation),
 *   so deletion is non-destructive — affected txns simply become Uncategorized.
 *   Any CategoryRule rows pointing at this category are cascaded by the rule's
 *   own onDelete: Cascade.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

function lastId(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

const patchInput = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  kind: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE"]).optional(),
  parentId: z.string().cuid().nullable().optional(),
});

export const PATCH = withAuth(async (userId, req) => {
  const id = lastId(new URL(req.url).pathname);
  const data = await parseBody(req, patchInput);

  const before = await prisma.category.findFirst({ where: { id, userId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.parentId) {
    const owns = await prisma.category.count({ where: { id: data.parentId, userId } });
    if (!owns) return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
  }
  const after = await prisma.category.update({ where: { id }, data });
  await recordAudit({
    userId, action: "category.update", targetType: "Category", targetId: id,
    before, after, req,
  });
  return NextResponse.json(after);
});

export const DELETE = withAuth(async (userId, req) => {
  const id = lastId(new URL(req.url).pathname);
  const before = await prisma.category.findFirst({
    where: { id, userId },
    include: { _count: { select: { transactions: true } } },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.category.delete({ where: { id } });
  await recordAudit({
    userId, action: "category.delete", targetType: "Category", targetId: id,
    before: { name: before.name, kind: before.kind, transactionCount: before._count.transactions },
    req,
  });
  return NextResponse.json({ deleted: true, freedTransactions: before._count.transactions });
});
