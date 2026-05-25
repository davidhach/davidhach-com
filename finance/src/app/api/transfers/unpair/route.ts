/**
 * POST /api/transfers/unpair { transactionId }
 *
 * Detaches the pair from both sides — useful when the user marked something
 * as a transfer by mistake. Both transactions go back into the spending /
 * income totals.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const input = z.object({ transactionId: z.string().cuid() });

export const POST = withAuth(async (userId, req) => {
  const { transactionId } = await parseBody(req, input);
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!t.transferPairId) return NextResponse.json({ ok: true, alreadyUnpaired: true });

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: t.id },
      data: { transferPairId: null, transferKind: null, excludeFromTotals: false },
    }),
    prisma.transaction.update({
      where: { id: t.transferPairId },
      data: { transferPairId: null, transferKind: null, excludeFromTotals: false },
    }),
  ]);
  await recordAudit({
    userId, action: "transfer.unpair", targetType: "Transaction", targetId: t.id, req,
  });
  return NextResponse.json({ ok: true });
});
