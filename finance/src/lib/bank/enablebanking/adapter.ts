/**
 * Enable Banking adapter: pulls balances + recent transactions for every
 * linked account on a connection. Handles consent-expired by short-circuiting
 * with `consentExpired: true` so the orchestrator transitions status.
 *
 * READ-ONLY by construction. This module imports only read endpoints from the
 * client (no /payments / PIS), and the BankAdapter interface has no write
 * methods to begin with.
 */
import { Decimal } from "decimal.js";
import { prisma } from "../../db";
import type { BankAdapter, SyncArgs, SyncResult, AdapterTransaction } from "../types";
import { getBalances, getTransactions, getSession, isConsentExpired } from "./client";

export const enableBankingAdapter: BankAdapter = {
  id: "enablebanking",

  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    if (!connection.requisitionId) {
      throw new Error("Enable Banking connection missing session id");
    }
    // Confirm the session still has accounts (also gives us the canonical list
    // in case the user revoked one at the bank).
    const session = await getSession(connection.requisitionId);
    if (isConsentExpired(session)) {
      return { balances: [], transactions: {}, consentExpired: true };
    }
    const sessionAccounts =
      (session.accounts && session.accounts.length > 0)
        ? session.accounts
        : (session.accounts_data ?? []).map((a) => ({
            uid: a.uid, account_id: a.account_id, currency: a.currency, name: a.name,
          }));
    const accountIds = sessionAccounts.map((a) => a.uid);
    if (accountIds.length === 0) return { balances: [], transactions: {} };

    // Sync window: 30 days back. Free tier quota is generous enough; this still
    // catches anything that happened since the last cron run with margin.
    const since = new Date(); since.setUTCDate(since.getUTCDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    // Restrict to accounts the user actually mapped (saves quota on siblings).
    const linked = await prisma.bankAccountLink.findMany({
      where: { connectionId: connection.id },
      select: { externalId: true },
    });
    const wanted = new Set(linked.map((l) => l.externalId));
    const toSync = accountIds.filter((id) => wanted.size === 0 || wanted.has(id));

    const result: SyncResult = { balances: [], transactions: {} };

    for (const uid of toSync) {
      const balances = await getBalances(uid);
      if (isConsentExpired(balances)) return { balances: [], transactions: {}, consentExpired: true };
      const usable =
        balances.balances.find((b) => b.balance_type === "ITAV") ??     // interim available
        balances.balances.find((b) => b.balance_type === "CLBD") ??     // closing booked
        balances.balances.find((b) => b.balance_type === "XPCD") ??     // expected
        balances.balances[0];
      if (usable) {
        result.balances.push({
          externalId: uid,
          amount: new Decimal(usable.balance_amount.amount),
          currency: usable.balance_amount.currency,
          asOf: usable.reference_date ? new Date(usable.reference_date) : new Date(),
        });
      }

      const txns = await getTransactions(uid, { dateFrom: sinceStr });
      if (isConsentExpired(txns)) return { balances: [], transactions: {}, consentExpired: true };
      const mapped: AdapterTransaction[] = txns.transactions.map((t) => {
        const amt = new Decimal(t.transaction_amount.amount);
        const signed = t.credit_debit_indicator === "DBIT" ? amt.neg() : amt;
        const counterparty = t.creditor?.name ?? t.debtor?.name ?? null;
        const remittance = (t.remittance_information ?? []).join(" ").trim();
        return {
          externalId: t.entry_reference ?? null,
          date: new Date(t.booking_date ?? t.transaction_date ?? t.value_date ?? new Date().toISOString()),
          amount: signed,
          currency: t.transaction_amount.currency,
          description: remittance || counterparty || "—",
          merchant: counterparty,
        };
      });
      result.transactions[uid] = mapped;
    }
    return result;
  },
};
