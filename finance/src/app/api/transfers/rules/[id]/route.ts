/**
 * DELETE /api/transfers/rules/[id] — removes the rule.
 *
 * Transactions previously excluded by this rule stay excluded (they were
 * mutated, not joined). Use POST /api/transfers/unmark on individual rows to
 * restore them. This keeps mass-undo opt-in.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { recordAudit } from "@/lib/audit";

function lastId(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const DELETE = withAuth(async (userId, req) => {
  const id = lastId(new URL(req.url).pathname);
  const before = await prisma.transferRule.findFirst({ where: { id, userId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.transferRule.delete({ where: { id } });
  await recordAudit({
    userId, action: "transfer-rule.delete", targetType: "TransferRule", targetId: id,
    before, req,
  });
  return NextResponse.json({ deleted: true });
});
