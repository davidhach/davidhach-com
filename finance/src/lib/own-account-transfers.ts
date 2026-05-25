/**
 * One-sided self-transfer detection.
 *
 * Two sources of "this counterparty is one of MY accounts":
 *
 *   1. AUTO: every connected BankAccountLink. We seed an in-memory set of
 *      identifiers from link.iban + link.finAccount.name + connection.
 *      institutionName so a transfer between connected sides is caught even
 *      when only one side has txns yet.
 *
 *   2. USER-DEFINED TransferRule rows. The user clicks "to/from my own
 *      account" on any transaction; we create a rule keyed by
 *      merchantNormalized (or IBAN if one is extractable). All current +
 *      future matching transactions get transferKind=TRANSFER + excludeFromTotals.
 *
 * Built-in patterns for known transfer providers (Wise / TransferWise) are
 * always considered self-transfer candidates UNTIL the user disconnects from
 * Wise as a real account, at which point those rows are paired two-sided.
 *
 * Read-only side-effect: never moves money; only flips display flags.
 */
import { prisma } from "./db";

// IBAN regex: 2 letters + 13–32 alphanumerics. We extract once per txn.
const IBAN_RE = /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/i;

// Known transfer-aggregator counterparties that almost always represent the
// user moving money between their own accounts. Lower-cased.
const KNOWN_OWN_PROVIDERS = [
  "wise payments",
  "transferwise",
  "wise europe",
  "wise ",            // bare "Wise" — note trailing space to avoid "wisetech"
  "revolut",          // controversial but typically the user's own R account
];

export interface SelfTransferContext {
  userId: string;
  ownPatterns: Array<{ matchType: "MERCHANT_EXACT" | "IBAN_EXACT" | "DESCRIPTION_CONTAINS"; pattern: string }>;
}

/** Build the user's "own account" detection context from connected links + user TransferRules. */
export async function loadSelfTransferContext(userId: string): Promise<SelfTransferContext> {
  const [links, rules] = await Promise.all([
    prisma.bankAccountLink.findMany({
      where: { userId },
      include: { finAccount: { select: { name: true } }, connection: { select: { institutionName: true } } },
    }),
    prisma.transferRule.findMany({ where: { userId } }),
  ]);
  const ownPatterns: SelfTransferContext["ownPatterns"] = [];

  for (const l of links) {
    if (l.iban) ownPatterns.push({ matchType: "IBAN_EXACT", pattern: l.iban.replace(/\s+/g, "").toUpperCase() });
    if (l.finAccount?.name) ownPatterns.push({ matchType: "DESCRIPTION_CONTAINS", pattern: l.finAccount.name.toLowerCase() });
    if (l.connection?.institutionName) ownPatterns.push({ matchType: "DESCRIPTION_CONTAINS", pattern: l.connection.institutionName.toLowerCase() });
  }
  for (const r of rules) ownPatterns.push({ matchType: r.matchType, pattern: r.pattern.toLowerCase() });
  // Always include the known providers as DESCRIPTION_CONTAINS hits.
  for (const p of KNOWN_OWN_PROVIDERS) ownPatterns.push({ matchType: "DESCRIPTION_CONTAINS", pattern: p });
  return { userId, ownPatterns };
}

/**
 * Return true if a transaction's description / merchant indicates the
 * counterparty is one of the user's own accounts.
 */
export function isSelfTransfer(
  ctx: SelfTransferContext,
  tx: { description: string; merchant: string | null; merchantNormalized: string | null },
): boolean {
  const desc = (tx.description ?? "").toLowerCase();
  const merch = (tx.merchant ?? "").toLowerCase();
  const merchN = (tx.merchantNormalized ?? "").toLowerCase();
  const haystack = `${desc} ${merch} ${merchN}`;
  const ibanMatch = haystack.match(IBAN_RE);
  const iban = ibanMatch ? ibanMatch[1].replace(/\s+/g, "").toUpperCase() : null;

  for (const p of ctx.ownPatterns) {
    if (p.matchType === "MERCHANT_EXACT") {
      if (merchN === p.pattern) return true;
    } else if (p.matchType === "IBAN_EXACT") {
      if (iban && iban === p.pattern) return true;
    } else { // DESCRIPTION_CONTAINS
      if (p.pattern && haystack.includes(p.pattern)) return true;
    }
  }
  return false;
}

/** Mark a single existing transaction as a self-transfer. Idempotent. */
export async function markAsSelfTransfer(userId: string, transactionId: string): Promise<boolean> {
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, userId }, select: { id: true, transferPairId: true } });
  if (!t) return false;
  // If it's already paired two-sided, leave alone (the pair handles exclusion).
  if (t.transferPairId) return true;
  await prisma.transaction.update({
    where: { id: t.id },
    data: { transferKind: "TRANSFER", excludeFromTotals: true },
  });
  return true;
}

/** Mark a transaction back as regular spend/income. */
export async function unmarkSelfTransfer(userId: string, transactionId: string): Promise<boolean> {
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
  if (!t) return false;
  // Don't touch two-sided pairs — those use /api/transfers/unpair instead.
  if (t.transferPairId) return false;
  await prisma.transaction.update({
    where: { id: t.id },
    data: { transferKind: null, excludeFromTotals: false },
  });
  return true;
}

/**
 * Create-or-reuse a TransferRule from a sample transaction. Prefers IBAN
 * match if one is extractable; otherwise uses merchantNormalized.
 * Then backfills every matching existing transaction.
 */
export async function createRuleFromTransaction(args: {
  userId: string;
  transactionId: string;
  label?: string;
}): Promise<{ ruleId: string; backfilled: number; pattern: string; matchType: "MERCHANT_EXACT" | "IBAN_EXACT" | "DESCRIPTION_CONTAINS" }> {
  const t = await prisma.transaction.findFirst({
    where: { id: args.transactionId, userId: args.userId },
  });
  if (!t) throw new Error("Transaction not found");

  const haystack = `${t.description ?? ""} ${t.merchant ?? ""}`;
  const ibanMatch = haystack.match(IBAN_RE);
  const iban = ibanMatch ? ibanMatch[1].replace(/\s+/g, "").toUpperCase() : null;

  let matchType: "MERCHANT_EXACT" | "IBAN_EXACT" | "DESCRIPTION_CONTAINS";
  let pattern: string;
  if (iban) {
    matchType = "IBAN_EXACT";
    pattern = iban;
  } else if (t.merchantNormalized) {
    matchType = "MERCHANT_EXACT";
    pattern = t.merchantNormalized.toLowerCase();
  } else {
    matchType = "DESCRIPTION_CONTAINS";
    pattern = (t.description ?? "").toLowerCase().slice(0, 80);
  }

  const rule = await prisma.transferRule.upsert({
    where: { userId_matchType_pattern: { userId: args.userId, matchType, pattern } },
    create: { userId: args.userId, matchType, pattern, label: args.label ?? null },
    update: { label: args.label ?? undefined },
  });
  const backfilled = await backfillByRule(args.userId, matchType, pattern);
  return { ruleId: rule.id, backfilled, pattern, matchType };
}

/** Apply a single rule across every matching un-paired transaction. */
export async function backfillByRule(
  userId: string,
  matchType: "MERCHANT_EXACT" | "IBAN_EXACT" | "DESCRIPTION_CONTAINS",
  pattern: string,
): Promise<number> {
  if (matchType === "MERCHANT_EXACT") {
    const r = await prisma.transaction.updateMany({
      where: { userId, merchantNormalized: pattern.toLowerCase(), transferPairId: null, excludeFromTotals: false },
      data: { transferKind: "TRANSFER", excludeFromTotals: true },
    });
    return r.count;
  }
  if (matchType === "DESCRIPTION_CONTAINS") {
    const r = await prisma.transaction.updateMany({
      where: { userId, description: { contains: pattern, mode: "insensitive" }, transferPairId: null, excludeFromTotals: false },
      data: { transferKind: "TRANSFER", excludeFromTotals: true },
    });
    return r.count;
  }
  // IBAN_EXACT — IBAN appears in description or merchant.
  const ibanUp = pattern.replace(/\s+/g, "").toUpperCase();
  const rows = await prisma.transaction.findMany({
    where: { userId, transferPairId: null, excludeFromTotals: false },
    select: { id: true, description: true, merchant: true },
  });
  const ids = rows
    .filter((r) => {
      const m = (`${r.description ?? ""} ${r.merchant ?? ""}`).match(IBAN_RE);
      return m && m[1].replace(/\s+/g, "").toUpperCase() === ibanUp;
    })
    .map((r) => r.id);
  if (ids.length === 0) return 0;
  const upd = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { transferKind: "TRANSFER", excludeFromTotals: true },
  });
  return upd.count;
}

/**
 * Apply ALL of the user's self-transfer rules + connection-based detection to
 * every un-flagged transaction. Used after seed/setup and on a "Re-scan
 * transfers" button. Capped for safety.
 */
export async function backfillAll(userId: string): Promise<number> {
  const ctx = await loadSelfTransferContext(userId);
  if (ctx.ownPatterns.length === 0) return 0;
  const rows = await prisma.transaction.findMany({
    where: { userId, transferPairId: null, excludeFromTotals: false },
    select: { id: true, description: true, merchant: true, merchantNormalized: true },
    take: 5000,
  });
  let count = 0;
  for (const r of rows) {
    if (isSelfTransfer(ctx, r)) {
      await prisma.transaction.update({
        where: { id: r.id },
        data: { transferKind: "TRANSFER", excludeFromTotals: true },
      });
      count++;
    }
  }
  return count;
}
