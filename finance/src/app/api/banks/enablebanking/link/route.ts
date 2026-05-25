/**
 * POST /api/banks/enablebanking/link
 *   { connectionId, links: [{ externalId, finAccountId, iban?, currency }] }
 *
 * Creates BankAccountLink rows for the chosen Enable Banking accounts, flips
 * the connection ACTIVE, then runs an initial sync inline.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { runSync } from "@/lib/bank";
import { recordAudit } from "@/lib/audit";

const input = z.object({
  connectionId: z.string().cuid(),
  links: z.array(z.object({
    externalId: z.string().min(1),
    finAccountId: z.string().cuid(),
    iban: z.string().max(40).optional(),
    currency: z.string().length(3).toUpperCase(),
  })).min(1).max(20),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  const conn = await prisma.bankConnection.findFirst({
    where: { id: data.connectionId, userId, provider: "enablebanking" },
  });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const finIds = [...new Set(data.links.map((l) => l.finAccountId))];
  const owned = await prisma.finAccount.count({ where: { userId, id: { in: finIds } } });
  if (owned !== finIds.length) {
    return NextResponse.json({ error: "One or more FinAccounts not found" }, { status: 404 });
  }

  await prisma.$transaction([
    ...data.links.map((l) =>
      prisma.bankAccountLink.upsert({
        where: { connectionId_externalId: { connectionId: data.connectionId, externalId: l.externalId } },
        create: {
          userId, connectionId: data.connectionId, finAccountId: l.finAccountId,
          externalId: l.externalId, iban: l.iban, currency: l.currency,
        },
        update: { finAccountId: l.finAccountId, iban: l.iban, currency: l.currency },
      }),
    ),
    prisma.bankConnection.update({
      where: { id: data.connectionId },
      data: { status: "ACTIVE", lastError: null },
    }),
  ]);

  await recordAudit({
    userId, action: "bank.enablebanking.link",
    targetType: "BankConnection", targetId: data.connectionId,
    after: { linkCount: data.links.length }, req,
  });

  const sync = await runSync(data.connectionId);
  return NextResponse.json({ ok: true, sync }, { status: 201 });
});
