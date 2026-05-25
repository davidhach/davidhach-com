/**
 * POST /api/banks/csv/depot/preview
 *   multipart/form-data: file=<csv>, currency?=EUR
 *
 * Parses a broker depot/positions CSV and returns the structured rows. The
 * user then maps each row to an Entity + FinAccount on /commit.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/require-auth";
import { parseDepotCsv } from "@/lib/bank/csv/depot-parse";

const MAX_BYTES = 2 * 1024 * 1024;

export const POST = withAuth(async (_userId, req) => {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Multipart body required" }, { status: 400 });

  const file = fd.get("file");
  const currency = (fd.get("currency") as string | null)?.toUpperCase() || "EUR";
  if (!(file instanceof File)) return NextResponse.json({ error: "file missing" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const text = await file.text();
  const result = parseDepotCsv(text, currency);
  return NextResponse.json({
    fileName: file.name, bytes: file.size,
    delimiter: result.delimiter, rows: result.rows, warnings: result.warnings.slice(0, 20),
  });
});
