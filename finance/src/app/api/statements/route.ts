/**
 * Statement upload pipeline.
 *
 * POST  /api/statements           -- multipart/form-data with `file` and optional `finAccountId`.
 *                                    Encrypts, stores in R2, creates a PENDING StatementUpload row.
 * GET   /api/statements           -- list user's uploads with status.
 *
 * The parse step is a separate route — see [id]/parse — so the user can retry
 * OCR without re-uploading.
 */
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { putEncrypted } from "@/lib/storage";
import { handle, ok, err, HttpError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const uploads = await prisma.statementUpload.findMany({
      where: { userId },
      orderBy: { uploadedAt: "desc" },
      include: { finAccount: true, extractions: { select: { id: true, structured: true, confidence: true, warnings: true } } },
    });
    return ok(uploads);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file");
    const finAccountId = form.get("finAccountId");

    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    if (file.size > MAX_BYTES) throw new HttpError(413, `File too large (max ${MAX_BYTES} bytes)`);
    if (!ALLOWED_MIME.has(file.type)) throw new HttpError(415, `Unsupported type: ${file.type}`);
    if (finAccountId && typeof finAccountId === "string") {
      const acct = await prisma.finAccount.findFirst({ where: { id: finAccountId, userId } });
      if (!acct) throw new HttpError(404, "Account not found");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = `statements/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const stored = await putEncrypted({ key, body: bytes, contentType: file.type });

    const upload = await prisma.statementUpload.create({
      data: {
        userId,
        finAccountId: typeof finAccountId === "string" ? finAccountId : null,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
        storageKey: stored.storageKey,
        ivBase64: stored.ivB64,
        wrappedDekB64: stored.wrappedDekB64,
        authTagB64: stored.authTagB64,
        status: "PENDING",
      },
    });

    await recordAudit({
      userId,
      action: "statement.upload",
      targetType: "StatementUpload",
      targetId: upload.id,
      after: { fileName: upload.fileName, byteSize: upload.byteSize },
      req,
    });
    return ok(upload, { status: 201 });
  });
}
