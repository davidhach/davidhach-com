/**
 * POST /api/categories/seed-defaults
 *
 * One-shot seeder: creates any missing default categories + rules, then
 * BACKFILLS existing uncategorised transactions by re-running every rule.
 * Idempotent — safe to re-run; existing rows aren't touched.
 *
 * Wired from the Settings → Categories panel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "@/lib/default-categories";
import { applyRulesToTransaction } from "@/lib/category-rules";

export const POST = withAuth(async (userId, req) => {
  // 1) Ensure categories exist. Unique key is (userId, name, kind).
  const existing = await prisma.category.findMany({
    where: { userId, kind: { in: ["INCOME", "EXPENSE"] } },
    select: { id: true, name: true, kind: true },
  });
  const byKey = new Map(existing.map((c) => [`${c.name}|${c.kind}`, c.id]));

  let categoriesCreated = 0;
  for (const d of DEFAULT_CATEGORIES) {
    if (byKey.has(`${d.name}|${d.kind}`)) continue;
    const c = await prisma.category.create({ data: { userId, name: d.name, kind: d.kind } });
    byKey.set(`${d.name}|${d.kind}`, c.id);
    categoriesCreated++;
  }

  // 2) Ensure rules exist. Unique key is (userId, matchType, pattern).
  let rulesCreated = 0;
  for (const r of DEFAULT_RULES) {
    // Resolve category id — prefer EXPENSE match, fall back to INCOME (some
    // names overlap conceptually, but our defaults split them cleanly).
    const catId =
      byKey.get(`${r.category}|EXPENSE`) ?? byKey.get(`${r.category}|INCOME`);
    if (!catId) continue;
    const pattern = r.pattern.toLowerCase();
    const created = await prisma.categoryRule.upsert({
      where: { userId_matchType_pattern: { userId, matchType: "DESCRIPTION_CONTAINS", pattern } },
      create: { userId, matchType: "DESCRIPTION_CONTAINS", pattern, categoryId: catId, priority: 0 },
      update: {},   // don't override user-edited mappings
    });
    if (created.createdAt.getTime() === created.updatedAt.getTime()) rulesCreated++;
  }

  // 3) Backfill: re-apply rules to every uncategorised transaction. Bounded so
  // a huge account can't time out the request.
  const uncategorised = await prisma.transaction.findMany({
    where: { userId, categoryId: null },
    orderBy: { date: "desc" },
    take: 2000,
    select: { id: true },
  });
  let transactionsUpdated = 0;
  for (const t of uncategorised) {
    if (await applyRulesToTransaction(userId, t.id)) transactionsUpdated++;
  }

  await recordAudit({
    userId, action: "categories.seed-defaults",
    after: { categoriesCreated, rulesCreated, transactionsUpdated },
    req,
  });

  return NextResponse.json({ categoriesCreated, rulesCreated, transactionsUpdated });
});
