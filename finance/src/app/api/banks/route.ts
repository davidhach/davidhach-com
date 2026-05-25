/**
 * GET /api/banks — list all BankConnection rows + their account links for the user.
 */
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { ok } from "@/lib/api";

export const GET = withAuth(async (userId) => {
  const rows = await prisma.bankConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      links: { include: { finAccount: { select: { id: true, name: true, currency: true } } } },
    },
  });
  return ok(rows);
});
