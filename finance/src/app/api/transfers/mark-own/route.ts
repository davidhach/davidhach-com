/**
 * POST /api/transfers/mark-own
 *   { transactionId, alsoCreateRule?: boolean, label? }
 *
 * The one-click "this is a transfer to/from my own account" button. Marks
 * the transaction as excluded from totals. If alsoCreateRule (default true),
 * creates a TransferRule keyed on the best available counterparty signal
 * (IBAN → MERCHANT_EXACT → DESCRIPTION_CONTAINS) and backfills all matching
 * existing transactions.
 *
 * Inverse: POST /api/transfers/unmark.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { createRuleFromTransaction, markAsSelfTransfer } from "@/lib/own-account-transfers";

const input = z.object({
  transactionId: z.string().cuid(),
  alsoCreateRule: z.boolean().optional(),
  label: z.string().max(120).optional(),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);
  const wantRule = data.alsoCreateRule !== false;

  const marked = await markAsSelfTransfer(userId, data.transactionId);
  if (!marked) return NextResponse.json({ error: "Transaction not found or already paired" }, { status: 404 });

  let ruleInfo: { ruleId: string; backfilled: number; pattern: string; matchType: string } | null = null;
  if (wantRule) {
    try {
      ruleInfo = await createRuleFromTransaction({
        userId, transactionId: data.transactionId, label: data.label,
      });
    } catch (e) {
      // The mark succeeded; rule creation is best-effort. Don't 500 the request.
      console.error("createRuleFromTransaction failed", (e as Error).message);
    }
  }

  await recordAudit({
    userId, action: "transfer.mark-own", targetType: "Transaction", targetId: data.transactionId,
    after: { rule: ruleInfo }, req,
  });
  return NextResponse.json({ ok: true, rule: ruleInfo });
});
