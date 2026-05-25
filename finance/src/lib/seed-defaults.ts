/**
 * User-scoped default seeding — extracted from the seed-defaults route so the
 * sync orchestrator can call it the first time a user lands any transactions
 * (no manual button required).
 *
 * Idempotent: existing categories + rules are left alone. Backfills every
 * uncategorised CLEARED transaction by running the rules over it. Bounded.
 */
import { prisma } from "./db";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "./default-categories";
import { applyRulesToTransaction } from "./category-rules";

export interface SeedResult {
  categoriesCreated: number;
  rulesCreated: number;
  transactionsUpdated: number;
}

export async function seedUserDefaults(userId: string): Promise<SeedResult> {
  // 1) Categories.
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

  // 2) Rules.
  let rulesCreated = 0;
  for (const r of DEFAULT_RULES) {
    const catId = byKey.get(`${r.category}|EXPENSE`) ?? byKey.get(`${r.category}|INCOME`);
    if (!catId) continue;
    const pattern = r.pattern.toLowerCase();
    const created = await prisma.categoryRule.upsert({
      where: { userId_matchType_pattern: { userId, matchType: "DESCRIPTION_CONTAINS", pattern } },
      create: { userId, matchType: "DESCRIPTION_CONTAINS", pattern, categoryId: catId, priority: 0 },
      update: {},
    });
    if (created.createdAt.getTime() === created.updatedAt.getTime()) rulesCreated++;
  }

  // 3) Backfill.
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
  return { categoriesCreated, rulesCreated, transactionsUpdated };
}

/**
 * Called from the bank-sync orchestrator. If this user has no CategoryRules
 * yet (= they've never seeded), run the defaults so their freshly-synced
 * transactions get categorised. Cheap no-op on subsequent syncs.
 */
export async function autoSeedIfFirstRun(userId: string): Promise<SeedResult | null> {
  const count = await prisma.categoryRule.count({ where: { userId } });
  if (count > 0) return null;
  return seedUserDefaults(userId);
}
