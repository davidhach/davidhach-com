/**
 * POST /api/banks/csv/preview
 *   multipart/form-data: file=<csv>, currency?=EUR
 *
 * Parses the CSV server-side (so the user can't trick the client into bad
 * dedupe) and returns the structured rows for review. Nothing is written to
 * the DB at this step — the user confirms via /commit.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { parseBankCsv } from "@/lib/bank/csv/parse";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB

export const POST = withAuth(async (_userId, req) => {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Multipart body required" }, { status: 400 });

  const file = fd.get("file");
  const currency = (fd.get("currency") as string | null)?.toUpperCase() || "EUR";
  if (!(file instanceof File)) return NextResponse.json({ error: "file field missing" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 2 MiB)" }, { status: 413 });

  const text = await file.text();
  const result = parseBankCsv(text, currency);
  return NextResponse.json({
    fileName: file.name,
    bytes: file.size,
    delimiter: result.delimiter,
    rows: result.rows,
    warnings: result.warnings.slice(0, 20),
  });
});
