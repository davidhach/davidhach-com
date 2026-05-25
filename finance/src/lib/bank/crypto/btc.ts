/**
 * Bitcoin address adapter. Reads a single BTC address's confirmed balance
 * from mempool.space (free, no API key, generous rate limits).
 *
 * We treat the address as one "account" with a single daily balance reading.
 * No transaction-level sync — the UTXO model doesn't map cleanly to the
 * Transaction shape, and the brief explicitly accepts BTC tracking via balance.
 */
import { Decimal } from "decimal.js";
import type { BankAdapter, SyncArgs, SyncResult } from "../types";

const SAT_PER_BTC = new Decimal("100000000");

export const btcAdapter: BankAdapter = {
  id: "btc_address",
  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    const address = connection.address?.trim();
    if (!address) return { balances: [], transactions: {} };

    const url = `https://mempool.space/api/address/${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "ledger-app" } });
    if (!res.ok) {
      // 404 = address never seen → balance 0. Anything else is a transport issue.
      if (res.status === 404) {
        return {
          balances: [{ externalId: address, amount: new Decimal(0), currency: "BTC", asOf: new Date() }],
          transactions: {},
        };
      }
      throw new Error(`mempool.space returned ${res.status}`);
    }
    const data = (await res.json()) as {
      chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
      mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    };
    const confirmedSats =
      (data.chain_stats?.funded_txo_sum ?? 0) - (data.chain_stats?.spent_txo_sum ?? 0);
    const btc = new Decimal(confirmedSats).div(SAT_PER_BTC);
    return {
      balances: [{ externalId: address, amount: btc, currency: "BTC", asOf: new Date() }],
      transactions: {},
    };
  },
};
