/**
 * GoCardless adapter: pulls balances + recent transactions for every linked
 * account on a connection. Handles the consent-expired case by short-
 * circuiting and letting the caller transition status → CONSENT_EXPIRED.
 *
 * Read-only by construction. No PIS calls. No write endpoints touched.
 */
import { Decimal } from "decimal.js";
import { prisma } from "../../db";
import type { BankAdapter, SyncArgs, SyncResult, AdapterTransaction } from "../types";
import {
  getRequisition, getBalances, getTransactions, isConsentExpired,
} from "./client";

export const gocardlessAdapter: BankAdapter = {
  id: "gocardless",

  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    if (!connection.requisitionId) {
      throw new Error("GoCardless connection missing requisitionId");
    }
    // Resolve the current set of accounts under this requisition.
    const req = await getRequisition(connection.requisitionId);
    const accountIds = req.accounts ?? [];
    if (accountIds.length === 0) {
      return { balances: [], transactions: {} };
    }

    // Sync window: 30 days back is enough for "what changed since last cron run"
    // without bumping into the free-tier 4-call-per-day-per-endpoint cap.
    const since = new Date(); since.setUTCDate(since.getUTCDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const result: SyncResult = { balances: [], transactions: {} };

    // Optimisation: only sync accounts the user actually mapped to a FinAccount.
    // Saves API quota for "extra" sibling accounts under the same consent.
    const linked = await prisma.bankAccountLink.findMany({
      where: { connectionId: connection.id },
      select: { externalId: true },
    });
    const wanted = new Set(linked.map((l) => l.externalId));
    const toSync = accountIds.filter((id) => wanted.size === 0 || wanted.has(id));

    for (const accountId of toSync) {
      const balances = await getBalances(accountId);
      if (isConsentExpired(balances)) return { balances: [], transactions: {}, consentExpired: true };
      const usable =
        balances.balances.find((b) => b.balanceType === "interimAvailable") ??
        balances.balances.find((b) => b.balanceType === "closingBooked") ??
        balances.balances[0];
      if (usable) {
        result.balances.push({
          externalId: accountId,
          amount: new Decimal(usable.balanceAmount.amount),
          currency: usable.balanceAmount.currency,
          asOf: usable.referenceDate ? new Date(usable.referenceDate) : new Date(),
        });
      }

      const txns = await getTransactions(accountId, sinceStr);
      if (isConsentExpired(txns)) return { balances: [], transactions: {}, consentExpired: true };
      const mapped: AdapterTransaction[] = txns.transactions.booked.map((t) => ({
        externalId: t.transactionId ?? null,
        date: new Date(t.bookingDate ?? t.valueDate ?? new Date().toISOString()),
        amount: new Decimal(t.transactionAmount.amount),
        currency: t.transactionAmount.currency,
        description:
          (t.remittanceInformationUnstructured ?? t.remittanceInformationStructured ?? "").trim() ||
          (t.creditorName ?? t.debtorName ?? "—"),
        merchant: t.creditorName ?? t.debtorName ?? null,
      }));
      result.transactions[accountId] = mapped;
    }
    return result;
  },
};
