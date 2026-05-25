/**
 * POST /api/banks/crypto — create a BTC or ETH address connection.
 *
 *   { provider: "btc_address" | "eth_address",
 *     address: "bc1q...", finAccountId, label?: "Cold wallet" }
 *
 * Does an initial sync inline so the user sees a balance immediately.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { parseBody } from "@/lib/api";
import { runSync } from "@/lib/bank";
import { recordAudit } from "@/lib/audit";

const input = z.object({
  provider: z.enum(["btc_address", "eth_address"]),
  address: z.string().min(8).max(120),
  finAccountId: z.string().cuid(),
  label: z.string().max(80).optional(),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);

  // The FinAccount must belong to the user.
  const acc = await prisma.finAccount.findFirst({
    where: { id: data.finAccountId, userId },
    select: { id: true, currency: true, name: true },
  });
  if (!acc) return NextResponse.json({ error: "FinAccount not found" }, { status: 404 });

  const connection = await prisma.bankConnection.create({
    data: {
      userId,
      provider: data.provider,
      institutionId: null,
      institutionName: data.label ?? (data.provider === "btc_address" ? "Bitcoin address" : "Ethereum address"),
      status: "ACTIVE",
      address: data.address.trim(),
    },
  });

  await prisma.bankAccountLink.create({
    data: {
      userId,
      connectionId: connection.id,
      finAccountId: data.finAccountId,
      externalId: data.address.trim(),
      currency: data.provider === "btc_address" ? "BTC" : "ETH",
    },
  });

  await recordAudit({
    userId, action: "bank.crypto.create", targetType: "BankConnection", targetId: connection.id,
    after: { provider: data.provider, finAccountId: data.finAccountId }, req,
  });

  // Pull the first balance now so the UI shows real data immediately.
  const sync = await runSync(connection.id);
  return NextResponse.json({ connection, sync }, { status: 201 });
});
