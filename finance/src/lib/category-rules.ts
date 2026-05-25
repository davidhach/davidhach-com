/**
 * Category-rule application. A rule maps a merchant pattern to a Category and
 * gets applied to:
 *   - existing matching transactions when the user opts to backfill,
 *   - newly-ingested transactions (OCR pipeline) at insert time.
 *
 * Rules are ranked by priority desc, then createdAt desc — first match wins.
 * MERCHANT_EXACT compares against Transaction.merchantNormalized.
 * DESCRIPTION_CONTAINS does a case-insensitive substring search on description.
 */
import { prisma } from "./db";

export async function applyRulesToTransaction(userId: string, txnId: string): Promise<boolean> {
  const t = await prisma.transaction.findFirst({
    where: { id: txnId, userId },
    select: { id: true, description: true, merchantNormalized: true, categoryId: true },
  });
  if (!t || t.categoryId) return false;

  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  for (const r of rules) {
    if (matches(r.matchType, r.pattern, t.merchantNormalized, t.description)) {
      await prisma.transaction.update({ where: { id: t.id }, data: { categoryId: r.categoryId } });
      return true;
    }
  }
  return false;
}

export async function backfillRule(args: {
  userId: string;
  matchType: "MERCHANT_EXACT" | "DESCRIPTION_CONTAINS";
  pattern: string;
  categoryId: string;
  onlyUncategorized: boolean;
}): Promise<number> {
  const where = {
    userId: args.userId,
    ...(args.onlyUncategorized ? { categoryId: null } : {}),
    ...(args.matchType === "MERCHANT_EXACT"
      ? { merchantNormalized: args.pattern.toLowerCase() }
      : { description: { contains: args.pattern, mode: "insensitive" as const } }),
  };
  const res = await prisma.transaction.updateMany({ where, data: { categoryId: args.categoryId } });
  return res.count;
}

function matches(
  matchType: "MERCHANT_EXACT" | "DESCRIPTION_CONTAINS",
  pattern: string,
  merchantNormalized: string | null,
  description: string,
): boolean {
  const p = pattern.toLowerCase();
  if (matchType === "MERCHANT_EXACT") return (merchantNormalized ?? "").toLowerCase() === p;
  return description.toLowerCase().includes(p);
}
