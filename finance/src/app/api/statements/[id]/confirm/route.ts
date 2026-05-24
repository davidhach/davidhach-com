/**
 * Confirm step: user reviewed the extraction and clicked Save.
 * Body: { keep: string[], reject: string[], edits: Record<string, Partial<Transaction>> }
 * Marks kept rows CLEARED+reviewed, rejected rows REJECTED, applies edits.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";
import { normalizeMerchant } from "@/lib/ocr";

const confirmBody = z.object({
  keep: z.array(z.string().cuid()),
  reject: z.array(z.string().cuid()).default([]),
  edits: z.record(
    z.string().cuid(),
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/).optional(),
      description: z.string().min(1).max(500).optional(),
      merchant: z.string().max(200).optional().nullable(),
      categoryId: z.string().cuid().optional().nullable(),
      finAccountId: z.string().cuid().optional(),
    }),
  ).default({}),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await parseBody(req, confirmBody);

    const upload = await prisma.statementUpload.findFirst({ where: { id, userId } });
    if (!upload) throw new HttpError(404, "Upload not found");

    const pending = await prisma.transaction.findMany({
      where: {
        userId,
        ocrExtraction: { uploadId: id },
        status: "REVIEW",
      },
      select: { id: true },
    });
    const pendingIds = new Set(pending.map((t) => t.id));

    // zod applies the schema defaults at runtime; coalesce so the compiler
    // also treats these as always-present.
    const edits = body.edits ?? {};
    const reject = body.reject ?? [];

    // Apply edits
    for (const [txId, edit] of Object.entries(edits)) {
      if (!pendingIds.has(txId)) continue;
      const data: Record<string, unknown> = { ...edit };
      if (edit.date) data.date = new Date(edit.date);
      if (edit.merchant !== undefined) data.merchantNormalized = normalizeMerchant(edit.merchant);
      await prisma.transaction.update({ where: { id: txId }, data });
    }

    // Keep
    if (body.keep.length) {
      await prisma.transaction.updateMany({
        where: { id: { in: body.keep }, userId, status: "REVIEW" },
        data: { status: "CLEARED", reviewed: true },
      });
    }
    // Reject
    if (reject.length) {
      await prisma.transaction.updateMany({
        where: { id: { in: reject }, userId, status: "REVIEW" },
        data: { status: "REJECTED", reviewed: true },
      });
    }
    // Anything left untouched gets rejected — the user pressed Save, untouched = not wanted.
    const leftover = [...pendingIds].filter((p) => !body.keep.includes(p) && !reject.includes(p));
    if (leftover.length) {
      await prisma.transaction.updateMany({
        where: { id: { in: leftover }, userId, status: "REVIEW" },
        data: { status: "REJECTED", reviewed: true },
      });
    }

    await prisma.statementUpload.update({ where: { id }, data: { status: "COMPLETED" } });
    await recordAudit({
      userId,
      action: "statement.confirm",
      targetType: "StatementUpload",
      targetId: id,
      after: { kept: body.keep.length, rejected: reject.length + leftover.length },
      req,
    });
    return ok({ ok: true, kept: body.keep.length, rejected: reject.length + leftover.length });
  });
}
