/**
 * DELETE /api/banks/[id] — disconnect. Removes BankAccountLinks (via cascade)
 *   and the BankConnection. Past transactions are kept; they belong to the
 *   FinAccount, not the connection.
 *
 * POST /api/banks/[id]/refresh — handled in ./refresh/route.ts.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { recordAudit } from "@/lib/audit";

export const DELETE = withAuth(async (userId, req) => {
  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop()!;
  const conn = await prisma.bankConnection.findFirst({ where: { id, userId } });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.bankConnection.delete({ where: { id } });
  await recordAudit({
    userId, action: "bank.disconnect", targetType: "BankConnection", targetId: id,
    before: { provider: conn.provider, institutionName: conn.institutionName }, req,
  });
  return NextResponse.json({ ok: true });
});
