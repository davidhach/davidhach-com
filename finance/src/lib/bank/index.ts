/**
 * Bank-adapter registry + the sync orchestrator that the daily cron calls.
 *
 * The cron treats this as a black box: for each ACTIVE BankConnection, call
 * runSync(connection.id). All provider-specific behaviour is inside the
 * adapter; this module handles persistence, dedupe, and audit logging.
 */
import { Decimal } from "decimal.js";
import { prisma } from "../db";
import { recordAudit } from "../audit";
import { normalizeMerchant } from "../ocr";
import { applyRulesToTransaction } from "../category-rules";
import type { BankAdapter, AdapterTransaction } from "./types";
import { btcAdapter } from "./crypto/btc";
import { ethAdapter } from "./crypto/eth";
import { gocardlessAdapter } from "./gocardless/adapter";
import { enableBankingAdapter } from "./enablebanking/adapter";

const REGISTRY: Record<string, BankAdapter> = {
  btc_address:    btcAdapter,
  eth_address:    ethAdapter,
  enablebanking:  enableBankingAdapter,
  // gocardless is kept registered so existing connections (if any) continue to
  // sync. The Connect UI no longer offers it — GoCardless closed signups.
  gocardless:     gocardlessAdapter,
  // manual_csv has no daily sync — it's user-driven upload only.
};

export function getBankAdapter(id: string): BankAdapter | null {
  return REGISTRY[id] ?? null;
}

export interface SyncOutcome {
  connectionId: string;
  balanceUpdates: number;
  transactionsInserted: number;
  status: "ok" | "consent_expired" | "error";
  error?: string;
}

export async function runSync(connectionId: string): Promise<SyncOutcome> {
  const conn = await prisma.bankConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return { connectionId, balanceUpdates: 0, transactionsInserted: 0, status: "error", error: "not found" };

  const adapter = getBankAdapter(conn.provider);
  if (!adapter) return { connectionId, balanceUpdates: 0, transactionsInserted: 0, status: "error", error: `no adapter for ${conn.provider}` };

  const links = await prisma.bankAccountLink.findMany({ where: { connectionId } });

  try {
    const result = await adapter.sync({
      connection: {
        id: conn.id, userId: conn.userId, provider: conn.provider,
        institutionId: conn.institutionId, institutionName: conn.institutionName,
        requisitionId: conn.requisitionId,
        accessTokenEnc: conn.accessTokenEnc, refreshTokenEnc: conn.refreshTokenEnc,
        address: conn.address,
      },
      linkedExternalIds: links.map((l) => l.externalId),
    });

    if (result.consentExpired) {
      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: "CONSENT_EXPIRED", lastError: "Bank consent expired — reconnect required" },
      });
      await recordAudit({
        userId: conn.userId, action: "bank.sync.consent_expired",
        targetType: "BankConnection", targetId: connectionId,
      });
      return { connectionId, balanceUpdates: 0, transactionsInserted: 0, status: "consent_expired" };
    }

    let balanceUpdates = 0;
    for (const bal of result.balances) {
      const link = links.find((l) => l.externalId === bal.externalId);
      if (!link) continue;
      await prisma.bankAccountLink.update({
        where: { id: link.id },
        data: { lastBalance: bal.amount.toFixed(2), lastBalanceAt: bal.asOf, currency: bal.currency },
      });
      balanceUpdates++;
    }

    let txInserted = 0;
    for (const [externalId, txns] of Object.entries(result.transactions)) {
      const link = links.find((l) => l.externalId === externalId);
      if (!link) continue;
      txInserted += await persistTransactions(conn.userId, link.finAccountId, txns);
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE", lastSyncedAt: new Date(), lastError: null },
    });
    await recordAudit({
      userId: conn.userId, action: "bank.sync.ok",
      targetType: "BankConnection", targetId: connectionId,
      after: { balanceUpdates, transactionsInserted: txInserted },
    });
    return { connectionId, balanceUpdates, transactionsInserted: txInserted, status: "ok" };
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "ERROR", lastError: msg },
    });
    await recordAudit({
      userId: conn.userId, action: "bank.sync.error",
      targetType: "BankConnection", targetId: connectionId,
      after: { error: msg },
    });
    return { connectionId, balanceUpdates: 0, transactionsInserted: 0, status: "error", error: msg };
  }
}

/**
 * Insert transactions, deduping by (finAccountId, date, amount, merchantNormalized)
 * — same key the OCR pipeline uses, so cross-channel duplicates (statement OCR
 * + bank sync) are caught.
 */
async function persistTransactions(
  userId: string,
  finAccountId: string,
  txns: AdapterTransaction[],
): Promise<number> {
  let inserted = 0;
  for (const t of txns) {
    const merchantNorm = normalizeMerchant(t.merchant ?? t.description);
    const dateOnly = new Date(t.date.toISOString().slice(0, 10));
    // Idempotent: skip if a matching tx already exists.
    const existing = await prisma.transaction.findFirst({
      where: {
        userId, finAccountId,
        date: dateOnly,
        amount: new Decimal(t.amount.toString()).toFixed(2),
        merchantNormalized: merchantNorm,
      },
      select: { id: true },
    });
    if (existing) continue;

    const created = await prisma.transaction.create({
      data: {
        userId,
        finAccountId,
        date: dateOnly,
        amount: t.amount.toFixed(2),
        currency: t.currency,
        description: t.description,
        merchant: t.merchant ?? null,
        merchantNormalized: merchantNorm,
        status: "CLEARED",
        reviewed: false,
      },
    });
    await applyRulesToTransaction(userId, created.id);
    inserted++;
  }
  return inserted;
}
