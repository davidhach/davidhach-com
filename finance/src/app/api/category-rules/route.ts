/**
 * POST /api/category-rules
 *   { matchType, pattern, categoryId, backfill?: boolean, onlyUncategorized?: boolean }
 *
 * Creates a "teach the tool" rule that auto-categorises future matching
 * transactions. If `backfill` is true, all existing matching transactions are
 * updated in the same request (default: only uncategorised ones).
 *
 * Idempotent on (userId, matchType, pattern): re-POSTing the same key updates
 * the categoryId instead of erroring.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody, err } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { backfillRule } from "@/lib/category-rules";

const input = z.object({
  matchType: z.enum(["MERCHANT_EXACT", "DESCRIPTION_CONTAINS"]).default("MERCHANT_EXACT"),
  pattern: z.string().min(1).max(200),
  categoryId: z.string().cuid(),
  priority: z.number().int().min(0).max(1000).optional(),
  backfill: z.boolean().default(false),
  onlyUncategorized: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, input);

    const owns = await prisma.category.count({ where: { id: data.categoryId, userId } });
    if (!owns) return err("Category not found", 404);

    const pattern = data.pattern.toLowerCase();
    const rule = await prisma.categoryRule.upsert({
      where: { userId_matchType_pattern: { userId, matchType: data.matchType, pattern } },
      create: { userId, matchType: data.matchType, pattern, categoryId: data.categoryId, priority: data.priority ?? 0 },
      update: { categoryId: data.categoryId, priority: data.priority ?? undefined },
    });

    let backfilled = 0;
    if (data.backfill) {
      backfilled = await backfillRule({
        userId,
        matchType: data.matchType,
        pattern,
        categoryId: data.categoryId,
        onlyUncategorized: data.onlyUncategorized,
      });
    }

    await recordAudit({
      userId,
      action: "category-rule.upsert",
      targetType: "CategoryRule",
      targetId: rule.id,
      after: { ...rule, backfilled },
      req,
    });

    return ok({ rule, backfilled }, { status: 201 });
  });
}

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const rules = await prisma.categoryRule.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true, kind: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return ok(rules);
  });
}
