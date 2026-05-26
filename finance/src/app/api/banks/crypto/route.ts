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
import { isExtendedPrivateKey } from "@/lib/bank/crypto/btc";

/** Reject inputs that look like spendable secrets — extended PRIVATE keys
 *  or BIP39 seed phrases. We never want to store, let alone fetch with, these.
 *  (12/15/18/21/24 space-separated lowercase words is the BIP39 shape.) */
function looksLikeSecret(s: string): string | null {
  if (isExtendedPrivateKey(s)) return "That's an extended PRIVATE key (xprv/yprv/zprv). Paste the matching xpub/ypub/zpub instead.";
  const wordCount = s.trim().split(/\s+/).length;
  if ([12, 15, 18, 21, 24].includes(wordCount) && /^[a-z\s]+$/.test(s.trim())) {
    return "That looks like a seed phrase. NEVER paste it. Use your wallet's 'show xpub' or 'show address' feature instead.";
  }
  return null;
}

const input = z.object({
  provider: z.enum(["btc_address", "eth_address"]),
  address: z.string().min(8).max(160),
  finAccountId: z.string().cuid(),
  label: z.string().max(80).optional(),
});

export const POST = withAuth(async (userId, req) => {
  const data = await parseBody(req, input);
  const trimmed = data.address.trim();

  // Secret-detection: refuse private keys / seed phrases BEFORE we store
  // anything or talk to a third party. Belongs at the boundary.
  const secretReason = looksLikeSecret(trimmed);
  if (secretReason) return NextResponse.json({ error: secretReason }, { status: 400 });

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
      address: trimmed,
    },
  });

  await prisma.bankAccountLink.create({
    data: {
      userId,
      connectionId: connection.id,
      finAccountId: data.finAccountId,
      externalId: trimmed,
      currency: data.provider === "btc_address" ? "BTC" : "ETH",
    },
  });

  await recordAudit({
    userId, action: "bank.crypto.create", targetType: "BankConnection", targetId: connection.id,
    after: { provider: data.provider, finAccountId: data.finAccountId }, req,
  });

  // Pull the first balance now so the UI shows real data immediately. If the
  // sync errored (bad xpub, mempool.space unreachable, etc.) surface that
  // honestly with a 4xx instead of pretending the connection works — the row
  // is still saved so the user can retry, but the response makes the failure
  // obvious instead of a silent 0.00.
  const sync = await runSync(connection.id);
  if (sync.status !== "ok") {
    const fresh = await prisma.bankConnection.findUnique({ where: { id: connection.id } });
    return NextResponse.json(
      { connection: fresh, sync, error: fresh?.lastError ?? sync.error ?? "Initial sync failed — check the address/xpub and try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ connection, sync }, { status: 201 });
});
