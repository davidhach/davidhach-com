import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { transactionInput } from "@/lib/validation";
import { handle, ok, parseBody } from "@/lib/api";
import { normalizeMerchant } from "@/lib/ocr";
import { recordAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
    const cursor = url.searchParams.get("cursor");
    const txs = await prisma.transaction.findMany({
      where: { userId, status: { in: ["CLEARED", "PENDING"] } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { category: true, finAccount: true },
    });
    const nextCursor = txs.length > limit ? txs.pop()!.id : null;
    return ok({ transactions: txs, nextCursor });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, transactionInput);
    const tx = await prisma.transaction.create({
      data: {
        userId,
        finAccountId: data.finAccountId,
        categoryId: data.categoryId,
        date: new Date(data.date),
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        merchant: data.merchant,
        merchantNormalized: normalizeMerchant(data.merchant ?? data.description),
        status: "CLEARED",
        reviewed: true,
      },
    });
    await recordAudit({ userId, action: "transaction.create", targetType: "Transaction", targetId: tx.id, after: tx, req });
    return ok(tx, { status: 201 });
  });
}
