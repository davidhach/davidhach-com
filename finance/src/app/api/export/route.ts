/**
 * Data export: a single JSON document with everything the user owns.
 * (CSV variant lives at /api/export/csv — omitted from MVP scaffold for brevity.)
 *
 * Goal: a user can walk away with their data, byte-for-byte, at any time.
 */
import { requireUserId } from "@/lib/auth";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const [
      user, entities, accounts, assets, liabilities, valuations, snapshots,
      transactions, categories, tags, notes, uploads, extractions, goals, auditLogs,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.entity.findMany({ where: { userId } }),
      prisma.finAccount.findMany({ where: { userId } }),
      prisma.asset.findMany({ where: { userId } }),
      prisma.liability.findMany({ where: { userId } }),
      prisma.valuation.findMany({ where: { userId } }),
      prisma.snapshot.findMany({ where: { userId } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.tag.findMany({ where: { userId } }),
      prisma.note.findMany({ where: { userId } }),
      prisma.statementUpload.findMany({ where: { userId } }),
      prisma.ocrExtraction.findMany({ where: { userId } }),
      prisma.goal.findMany({ where: { userId } }),
      prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);

    const body = JSON.stringify(
      { exportedAt: new Date().toISOString(), schemaVersion: 1, user, entities, accounts, assets, liabilities, valuations, snapshots, transactions, categories, tags, notes, uploads, extractions, goals, auditLogs },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );

    return new NextResponse(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ledger-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  });
}
