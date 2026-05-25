/**
 * Detects internal transfers and credit-card settlements between two of the
 * user's own accounts.
 *
 * Strategy:
 *   - Pull recent unpaired CLEARED transactions across all of the user's accounts.
 *   - For each outflow, look for an inflow in a DIFFERENT account of the SAME
 *     entity within ±MAX_DAYS, with roughly the same amount.
 *   - Same currency: exact match. Cross currency: convert to a common currency
 *     and require ≤TOLERANCE_PCT relative gap.
 *   - kind = CARD_PAYMENT when either side's FinAccount.kind === CREDIT_CARD
 *     OR the description matches well-known card-issuer language.
 *
 * Returns at most MAX_SUGGESTIONS pairs, highest confidence first.
 */
import { Decimal } from "decimal.js";
import { prisma } from "./db";
import { convertSafe } from "./fx";

const MAX_DAYS = 5;
const TOLERANCE_PCT = 0.02;     // 2%
const MAX_SUGGESTIONS = 25;
const LOOKBACK_DAYS = 180;

const CARD_HINTS = [
  /\bamerican express\b/i,
  /\bamex\b/i,
  /\bmiles\s*&?\s*more\b/i,
  /\bkreditkart\w*/i,
  /\bcredit\s*card\b/i,
  /\bcard\s*(payment|settlement)\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
];

export interface TransferSuggestion {
  outflowId: string;
  inflowId: string;
  date: string;            // outflow date
  amount: string;          // outflow amount, displayed
  currency: string;        // outflow currency
  outflowAccount: string;
  inflowAccount: string;
  outflowDesc: string;
  inflowDesc: string;
  kind: "TRANSFER" | "CARD_PAYMENT";
  confidence: number;
}

export async function detectTransferSuggestions(userId: string): Promise<TransferSuggestion[]> {
  const since = new Date(); since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      status: "CLEARED",
      date: { gte: since },
      transferPairId: null,
      excludeFromTotals: false,
    },
    include: {
      finAccount: { select: { id: true, name: true, kind: true, entityId: true, currency: true } },
    },
    orderBy: { date: "asc" },
  });
  if (txs.length === 0) return [];

  // Group by entity for cheap lookups.
  const byEntity = new Map<string, typeof txs>();
  for (const t of txs) {
    const k = t.finAccount.entityId;
    const arr = byEntity.get(k) ?? [];
    arr.push(t);
    byEntity.set(k, arr);
  }

  const suggestions: TransferSuggestion[] = [];
  const consumedInflow = new Set<string>();   // each inflow paired at most once
  const consumedOutflow = new Set<string>();

  for (const group of byEntity.values()) {
    const outflows = group.filter((t) => new Decimal(t.amount.toString()).lt(0));
    const inflows  = group.filter((t) => new Decimal(t.amount.toString()).gt(0));

    for (const out of outflows) {
      if (consumedOutflow.has(out.id)) continue;
      const outAmt = new Decimal(out.amount.toString()).abs();
      const outDate = out.date.getTime();

      let bestMatch: { tx: typeof inflows[number]; confidence: number } | null = null;
      for (const inn of inflows) {
        if (consumedInflow.has(inn.id)) continue;
        if (inn.finAccountId === out.finAccountId) continue;   // must be different account
        const daysApart = Math.abs((inn.date.getTime() - outDate) / 86400000);
        if (daysApart > MAX_DAYS) continue;

        const inAmt = new Decimal(inn.amount.toString());
        let confidence = 0;

        if (inn.currency === out.currency) {
          if (inAmt.eq(outAmt)) {
            confidence = daysApart === 0 ? 1.0 : 0.95 - 0.05 * daysApart;
          } else continue;
        } else {
          // Cross-currency: convert both to outflow currency and compare with tolerance.
          const conv = await convertSafe({
            amount: inAmt, from: inn.currency, to: out.currency, date: inn.date,
          });
          if (!conv.ok) continue;
          const gap = conv.amount.minus(outAmt).abs().div(outAmt.eq(0) ? new Decimal(1) : outAmt).toNumber();
          if (gap > TOLERANCE_PCT) continue;
          confidence = (0.85 - 0.05 * daysApart) * (1 - gap * 10);
        }
        if (confidence <= 0) continue;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { tx: inn, confidence };
        }
      }

      if (!bestMatch) continue;
      const inn = bestMatch.tx;
      const isCardSide =
        out.finAccount.kind === "CREDIT_CARD" || inn.finAccount.kind === "CREDIT_CARD" ||
        CARD_HINTS.some((re) => re.test(out.description) || re.test(inn.description) ||
          re.test(out.merchant ?? "") || re.test(inn.merchant ?? ""));

      suggestions.push({
        outflowId: out.id,
        inflowId: inn.id,
        date: out.date.toISOString().slice(0, 10),
        amount: outAmt.toFixed(2),
        currency: out.currency,
        outflowAccount: out.finAccount.name,
        inflowAccount: inn.finAccount.name,
        outflowDesc: (out.merchant ?? out.description).slice(0, 80),
        inflowDesc:  (inn.merchant ?? inn.description).slice(0, 80),
        kind: isCardSide ? "CARD_PAYMENT" : "TRANSFER",
        confidence: Math.round(bestMatch.confidence * 100) / 100,
      });
      consumedOutflow.add(out.id);
      consumedInflow.add(inn.id);
    }
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS);
}
