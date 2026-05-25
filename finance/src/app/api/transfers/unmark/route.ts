/**
 * POST /api/transfers/unmark { transactionId }
 *
 * Removes the one-sided "self-transfer" flag from a single transaction so it
 * counts as spend/income again. Doesn't remove any TransferRule — use
 * DELETE /api/transfers/rules/[id] for that. Doesn't affect two-sided pairs
 * (use /api/transfers/unpair for those).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { unmarkSelfTransfer } from "@/lib/own-account-transfers";

const input = z.object({ transactionId: z.string().cuid() });

export const POST = withAuth(async (userId, req) => {
  const { transactionId } = await parseBody(req, input);
  const ok = await unmarkSelfTransfer(userId, transactionId);
  if (!ok) return NextResponse.json({ error: "Not found, or this is a two-sided pair (use /unpair)" }, { status: 400 });
  await recordAudit({
    userId, action: "transfer.unmark", targetType: "Transaction", targetId: transactionId, req,
  });
  return NextResponse.json({ ok: true });
});
