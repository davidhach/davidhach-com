import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";
import { handle, ok, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const upload = await prisma.statementUpload.findFirst({
      where: { id, userId },
      include: {
        finAccount: true,
        extractions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!upload) throw new HttpError(404, "Upload not found");
    const transactions = await prisma.transaction.findMany({
      where: { ocrExtractionId: upload.extractions[0]?.id ?? "" },
      orderBy: { date: "asc" },
      include: { category: true, finAccount: true },
    });
    return ok({ upload, transactions });
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const upload = await prisma.statementUpload.findFirst({ where: { id, userId } });
    if (!upload) throw new HttpError(404, "Upload not found");

    // Best-effort R2 delete; DB cascade clears related rows.
    try { await deleteObject(upload.storageKey); } catch (e) { console.warn("R2 delete failed", e); }
    await prisma.statementUpload.delete({ where: { id } });
    await recordAudit({ userId, action: "statement.delete", targetType: "StatementUpload", targetId: id, before: upload, req });
    return ok({ deleted: true });
  });
}
