/**
 * POST /api/transfers/confirm
 *   { outflowId, inflowId, kind: "TRANSFER" | "CARD_PAYMENT" }
 *
 * Pairs the two transactions: stores transferPairId on both sides and sets
 * excludeFromTotals = true so spending/income widgets skip them. Verifies the
 * user owns both rows and that they belong to the same entity.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const input = z.object({
  outflowId: z.string().cuid(),
  inflowId: z.string().cuid(),
  kind: z.enum(["TRANSFER", "CARD_PAYMENT"]),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);
  if (data.outflowId === data.inflowId) {
    return NextResponse.json({ error: "Cannot pair a transaction with itself" }, { status: 400 });
  }
  const [out, inn] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: data.outflowId, userId },
      include: { finAccount: { select: { entityId: true } } },
    }),
    prisma.transaction.findFirst({
      where: { id: data.inflowId, userId },
      include: { finAccount: { select: { entityId: true } } },
    }),
  ]);
  if (!out || !inn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (out.finAccount.entityId !== inn.finAccount.entityId) {
    return NextResponse.json({ error: "Transactions must belong to the same entity" }, { status: 400 });
  }
  if (out.transferPairId || inn.transferPairId) {
    return NextResponse.json({ error: "One or both transactions are already paired" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: out.id },
      data: { transferPairId: inn.id, transferKind: data.kind, excludeFromTotals: true },
    }),
    prisma.transaction.update({
      where: { id: inn.id },
      data: { transferPairId: out.id, transferKind: data.kind, excludeFromTotals: true },
    }),
  ]);

  await recordAudit({
    userId, action: "transfer.confirm", targetType: "Transaction", targetId: out.id,
    after: { pairedWith: inn.id, kind: data.kind }, req,
  });

  return NextResponse.json({ ok: true });
});
