/**
 * PATCH /api/accounts/[id]  — rename / kind / currency / institution / entityId
 * DELETE /api/accounts/[id] — safe delete: refuses if any non-archived asset,
 *   liability, transaction, or bank connection still references this account.
 *   The user should re-assign or archive dependents first.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { finAccountInput } from "@/lib/validation";

function lastId(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

const patchInput = finAccountInput.partial().extend({
  archived: z.boolean().optional(),
});

export const PATCH = withAuth(async (userId, req) => {
  const id = lastId(new URL(req.url).pathname);
  const data = await parseBody(req, patchInput);

  const before = await prisma.finAccount.findFirst({ where: { id, userId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If entity is changing, ensure the user owns the new entity.
  if (data.entityId && data.entityId !== before.entityId) {
    const owns = await prisma.entity.count({ where: { id: data.entityId, userId } });
    if (!owns) return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const after = await prisma.finAccount.update({ where: { id }, data });
  await recordAudit({
    userId, action: "account.update", targetType: "FinAccount", targetId: id,
    before, after, req,
  });
  return NextResponse.json(after);
});

export const DELETE = withAuth(async (userId, req) => {
  const id = lastId(new URL(req.url).pathname);
  const before = await prisma.finAccount.findFirst({ where: { id, userId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [assets, liabilities, transactions, bankLinks] = await Promise.all([
    prisma.asset.count({ where: { finAccountId: id, archived: false } }),
    prisma.liability.count({ where: { finAccountId: id, archived: false } }),
    prisma.transaction.count({ where: { finAccountId: id } }),
    prisma.bankAccountLink.count({ where: { finAccountId: id } }),
  ]);
  const total = assets + liabilities + transactions + bankLinks;
  if (total > 0) {
    return NextResponse.json(
      {
        error:
          `Account still has ${transactions} transaction(s), ${assets} asset(s), ` +
          `${liabilities} liability/ies, ${bankLinks} connection(s). ` +
          `Move or archive them first.`,
        assets, liabilities, transactions, bankLinks,
      },
      { status: 409 },
    );
  }

  await prisma.finAccount.delete({ where: { id } });
  await recordAudit({
    userId, action: "account.delete", targetType: "FinAccount", targetId: id,
    before, req,
  });
  return NextResponse.json({ deleted: true });
});
