/**
 * GET  /api/transfers/rules — list the user's "own account" rules.
 * POST /api/transfers/rules — create one manually:
 *   { matchType, pattern, label? }   → also backfills matching existing txns.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { backfillByRule } from "@/lib/own-account-transfers";

const input = z.object({
  matchType: z.enum(["MERCHANT_EXACT", "IBAN_EXACT", "DESCRIPTION_CONTAINS"]),
  pattern: z.string().min(1).max(200),
  label: z.string().max(120).optional(),
});

export const GET = withAuth(async (userId) => {
  const rows = await prisma.transferRule.findMany({
    where: { userId },
    orderBy: [{ matchType: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rows);
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);
  const pattern = data.pattern.toLowerCase();
  const rule = await prisma.transferRule.upsert({
    where: { userId_matchType_pattern: { userId, matchType: data.matchType, pattern } },
    create: { userId, matchType: data.matchType, pattern, label: data.label ?? null },
    update: { label: data.label ?? undefined },
  });
  const backfilled = await backfillByRule(userId, data.matchType, pattern);
  await recordAudit({
    userId, action: "transfer-rule.create", targetType: "TransferRule", targetId: rule.id,
    after: { matchType: data.matchType, pattern, backfilled }, req,
  });
  return NextResponse.json({ rule, backfilled }, { status: 201 });
});
