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
import { refreshAssetPrice } from "../price-refresh";
import type { BankAdapter, AdapterTransaction, AdapterBalance } from "./types";
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

    // Per-link processing is wrapped per-iteration so a transient hiccup on
    // ONE balance (e.g. a flaky CoinGecko response inside the auto-asset
    // upsert) never blocks the whole connection from going ACTIVE. The
    // adapter itself already succeeded — that's what we promise.
    let balanceUpdates = 0;
    const warnings: string[] = [];
    for (const bal of result.balances) {
      const link = links.find((l) => l.externalId === bal.externalId);
      if (!link) continue;
      try {
        await prisma.bankAccountLink.update({
          where: { id: link.id },
          data: { lastBalance: bal.amount.toFixed(2), lastBalanceAt: bal.asOf, currency: bal.currency },
        });
        // Surface the balance as a real net-worth-counted Asset. Idempotent:
        // matched by managedByLinkId, so re-syncs UPDATE the same Asset.
        await upsertManagedAsset({ userId: conn.userId, provider: conn.provider, link, bal });
        balanceUpdates++;
      } catch (e) {
        const msg = (e as Error).message ?? "unknown";
        console.error("link processing failed", link.id, msg);
        warnings.push(`${link.externalId.slice(0, 8)}…: ${msg}`);
      }
    }

    let txInserted = 0;
    for (const [externalId, txns] of Object.entries(result.transactions)) {
      const link = links.find((l) => l.externalId === externalId);
      if (!link) continue;
      try {
        txInserted += await persistTransactions(conn.userId, link.finAccountId, txns);
      } catch (e) {
        const msg = (e as Error).message ?? "unknown";
        console.error("persistTransactions failed", link.id, msg);
        warnings.push(`tx ${link.externalId.slice(0, 8)}…: ${msg}`);
      }
    }

    // Mark ACTIVE + clear any stale lastError. The presence of per-link
    // warnings doesn't demote the connection — they go into lastError as a
    // non-blocking note so the user knows but the row reads "active".
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        lastError: warnings.length > 0 ? `Sync OK with warnings — ${warnings.join("; ").slice(0, 500)}` : null,
      },
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

// ─── Auto-managed asset from connection balance ────────────────────────────
//
// Each synced bank or crypto link produces one Asset row that net worth +
// allocation count. Match key is (managedByLinkId) — unique-by-link — so a
// second sync UPDATES the row instead of creating a duplicate.
//
// READ-ONLY for the user: PATCH and DELETE on /api/assets/[id] both refuse
// when managedByLinkId is set. Deleting the connection (Cascade on the FK)
// is the only way to remove the row.
//
// Conventions:
//   - BTC address → CRYPTO "Bitcoin" asset, quantity = wallet BTC balance,
//     priceSource = coingecko, externalRef = bitcoin → daily price refresh.
//   - ETH address → same shape, "Ethereum" / externalRef "ethereum".
//   - Bank account (Enable Banking / GoCardless / etc.) → CASH asset,
//     currentValue = balance in the account's currency, no priceSource.
async function upsertManagedAsset(args: {
  userId: string;
  provider: string;
  link: { id: string; finAccountId: string; externalId: string; currency: string };
  bal: AdapterBalance;
}): Promise<void> {
  const { userId, provider, link, bal } = args;
  // Need the entity that owns the linked FinAccount.
  const fa = await prisma.finAccount.findUnique({
    where: { id: link.finAccountId },
    select: { entityId: true, name: true },
  });
  if (!fa) return;

  // Decide asset shape per provider.
  let data: {
    name: string;
    assetClass: "CRYPTO" | "CASH";
    currency: string;
    quantity?: string;
    currentValue: string;
    priceSource: string | null;
    externalRef: string | null;
  };
  if (provider === "btc_address") {
    data = {
      name: "Bitcoin",
      assetClass: "CRYPTO",
      currency: "BTC",
      quantity: bal.amount.toFixed(10),
      currentValue: "0",            // refreshAssetPrice below fills this in EUR/USD
      priceSource: "coingecko",
      externalRef: "bitcoin",
    };
  } else if (provider === "eth_address") {
    data = {
      name: "Ethereum",
      assetClass: "CRYPTO",
      currency: "ETH",
      quantity: bal.amount.toFixed(10),
      currentValue: "0",
      priceSource: "coingecko",
      externalRef: "ethereum",
    };
  } else {
    // Bank / card connector. The balance IS the value, no extra pricing needed.
    data = {
      name: `${fa.name} cash`,
      assetClass: "CASH",
      currency: bal.currency,
      currentValue: bal.amount.toFixed(2),
      priceSource: null,
      externalRef: null,
    };
  }

  const existing = await prisma.asset.findFirst({
    where: { userId, managedByLinkId: link.id },
    select: { id: true },
  });
  let assetId: string;
  if (existing) {
    await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...data,
        archived: false,
        finAccountId: link.finAccountId,
        entityId: fa.entityId,
      },
    });
    assetId = existing.id;
  } else {
    const created = await prisma.asset.create({
      data: {
        ...data,
        userId,
        entityId: fa.entityId,
        finAccountId: link.finAccountId,
        managedByLinkId: link.id,
        notes: "[managed] Auto-synced from connection — disconnect to remove.",
      },
    });
    assetId = created.id;
  }

  // For CRYPTO, fetch the live market price so currentValue isn't 0. CASH
  // assets are already at their authoritative value (the bank balance).
  if (data.priceSource && data.priceSource !== "manual") {
    await refreshAssetPrice(assetId).catch(() => {});
  }
}
