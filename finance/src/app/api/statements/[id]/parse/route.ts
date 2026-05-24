/**
 * Parse step: pull ciphertext from R2, decrypt, hand to Claude vision, validate
 * the JSON, materialise REVIEW-status Transaction rows tied to the upload.
 *
 * Idempotent — re-running re-parses and replaces pending review rows for this upload.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDecrypted } from "@/lib/storage";
import { extractTransactions, normalizeMerchant } from "@/lib/ocr";
import { handle, ok, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { Decimal } from "decimal.js";
import { startOfDay, subDays } from "date-fns";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const upload = await prisma.statementUpload.findFirst({ where: { id, userId } });
    if (!upload) throw new HttpError(404, "Upload not found");
    if (upload.mimeType !== "image/png" && upload.mimeType !== "image/jpeg" && upload.mimeType !== "image/webp") {
      throw new HttpError(415, "Unsupported mime type");
    }

    await prisma.statementUpload.update({ where: { id }, data: { status: "PARSING", errorMessage: null } });

    try {
      const plaintext = await getDecrypted({
        storageKey: upload.storageKey,
        ivB64: upload.ivBase64,
        authTagB64: upload.authTagB64,
        wrappedDekB64: upload.wrappedDekB64,
      });

      const { parsed, rawText, model } = await extractTransactions({
        imageBytes: plaintext,
        mimeType: upload.mimeType as "image/png" | "image/jpeg" | "image/webp",
      });

      // Replace any prior pending review rows for this upload so re-parse is clean.
      await prisma.$transaction(async (tx) => {
        const prior = await tx.ocrExtraction.findMany({ where: { uploadId: id } });
        if (prior.length) {
          await tx.transaction.deleteMany({
            where: { ocrExtractionId: { in: prior.map((p) => p.id) }, reviewed: false },
          });
          await tx.ocrExtraction.deleteMany({ where: { id: { in: prior.map((p) => p.id) } } });
        }

        const extraction = await tx.ocrExtraction.create({
          data: {
            userId,
            uploadId: id,
            model,
            rawText,
            structured: parsed as object,
            confidence: parsed.overallConfidence ?? null,
            warnings: parsed.warnings ?? undefined,
          },
        });

        // Find or fall back to a "no-account" placeholder — uploads can come in
        // without an account selected; the user will pick during review.
        const finAccountId = upload.finAccountId ?? (await tx.finAccount.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }))?.id;
        if (!finAccountId) {
          throw new HttpError(412, "Create an account before parsing — transactions need somewhere to live");
        }

        // Materialise transactions in REVIEW status. Flag duplicates against
        // recent cleared transactions on the same account.
        const txsToCreate: Array<{
          date: Date; amount: string; currency: string; description: string; merchant: string | null;
          merchantNormalized: string | null; confidence: number | null; duplicateOfId: string | null; categoryName: string | null;
        }> = [];

        const earliestDate = parsed.transactions.reduce<Date | null>((acc, t) => {
          const d = new Date(t.date);
          return acc === null || d < acc ? d : acc;
        }, null);
        const searchWindowStart = earliestDate ? subDays(earliestDate, 7) : subDays(new Date(), 90);

        const existing = await tx.transaction.findMany({
          where: {
            userId,
            finAccountId,
            date: { gte: startOfDay(searchWindowStart) },
            status: { in: ["CLEARED", "PENDING"] },
          },
          select: { id: true, date: true, amount: true, merchantNormalized: true },
        });

        for (const t of parsed.transactions) {
          const date = new Date(t.date);
          const amount = new Decimal(t.amount).toFixed(2);
          const merchant = t.merchant ?? null;
          const norm = normalizeMerchant(merchant ?? t.description);
          const dupe = existing.find(
            (e) =>
              Math.abs(e.date.getTime() - date.getTime()) <= 2 * 86_400_000 &&
              new Decimal(e.amount.toString()).eq(amount) &&
              (e.merchantNormalized ?? "") === (norm ?? ""),
          );
          txsToCreate.push({
            date,
            amount,
            currency: t.currency,
            description: t.description,
            merchant,
            merchantNormalized: norm,
            confidence: t.confidence ?? null,
            duplicateOfId: dupe?.id ?? null,
            categoryName: t.categoryGuess ?? null,
          });
        }

        // Resolve category names to ids — create EXPENSE/INCOME categories on the fly.
        const wantedCategories = [...new Set(txsToCreate.map((t) => t.categoryName).filter((c): c is string => !!c))];
        const existingCats = await tx.category.findMany({
          where: { userId, name: { in: wantedCategories }, kind: { in: ["EXPENSE", "INCOME"] } },
        });
        const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));
        for (const name of wantedCategories) {
          if (!catByName.has(name.toLowerCase())) {
            const isIncome = txsToCreate.some(
              (t) => t.categoryName === name && new Decimal(t.amount).gt(0),
            );
            const created = await tx.category.create({
              data: { userId, name, kind: isIncome ? "INCOME" : "EXPENSE" },
            });
            catByName.set(name.toLowerCase(), created);
          }
        }

        await tx.transaction.createMany({
          data: txsToCreate.map((t) => ({
            userId,
            finAccountId,
            ocrExtractionId: extraction.id,
            categoryId: t.categoryName ? catByName.get(t.categoryName.toLowerCase())?.id ?? null : null,
            date: t.date,
            amount: t.amount,
            currency: t.currency,
            description: t.description,
            merchant: t.merchant,
            merchantNormalized: t.merchantNormalized,
            status: "REVIEW",
            confidence: t.confidence,
            duplicateOfId: t.duplicateOfId,
          })),
        });

        await tx.statementUpload.update({
          where: { id },
          data: { status: "REVIEW", parsedAt: new Date() },
        });

        return extraction;
      });

      await recordAudit({ userId, action: "statement.parse", targetType: "StatementUpload", targetId: id, req });

      const updated = await prisma.statementUpload.findUnique({
        where: { id },
        include: {
          extractions: { take: 1, orderBy: { createdAt: "desc" } },
        },
      });
      const transactions = await prisma.transaction.findMany({
        where: { ocrExtractionId: updated?.extractions[0]?.id },
        include: { category: true },
        orderBy: { date: "asc" },
      });
      return ok({ upload: updated, transactions });
    } catch (e) {
      await prisma.statementUpload.update({
        where: { id },
        data: { status: "FAILED", errorMessage: (e as Error).message?.slice(0, 500) ?? "OCR failed" },
      });
      throw e;
    }
  });
}
