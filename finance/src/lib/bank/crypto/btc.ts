/**
 * Bitcoin adapter. Reads the confirmed balance from mempool.space (free, no
 * API key, generous rate limits). Two input modes:
 *
 *   1. Plain address (1…, 3…, bc1…) → /api/address/{addr}
 *      Reports only that single address's balance — fine for cold-storage
 *      receive-once setups, MISLEADING for HD wallets where funds are spread
 *      across many derived addresses (the original "qty 0.0000" bug).
 *
 *   2. Extended public key (xpub/ypub/zpub/Ypub/Zpub) → /api/v1/xpub/{xpub}
 *      mempool.space derives addresses on the BIP32 chain and aggregates
 *      chain_stats across the wallet. This is what HD-wallet users want.
 *
 * Both endpoints return the same {chain_stats: {funded_txo_sum, spent_txo_sum}}
 * shape; balance is funded − spent, in satoshis, confirmed only.
 *
 * Read-only by design — public keys / addresses only. Private keys (xprv/yprv/
 * zprv) and BIP39 seed phrases are refused at the API-route validation layer.
 */
import { Decimal } from "decimal.js";
import { fetchWithTimeout } from "../../net";
import type { BankAdapter, SyncArgs, SyncResult } from "../types";

const SAT_PER_BTC = new Decimal("100000000");
const MEMPOOL_TIMEOUT_MS = 8000;

/** Loose check for BIP32 extended PUBLIC keys (xpub/ypub/zpub variants).
 *  Length is ~111 base58 chars on mainnet. We deliberately accept the multisig
 *  prefixes (Ypub/Zpub) too — mempool.space handles them. */
export function isExtendedPublicKey(s: string): boolean {
  return /^([xyz]pub|[YZ]pub|[tuv]pub|[UV]pub)[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(s);
}

/** Refuse anything that looks like an extended PRIVATE key. Defence in depth —
 *  the connect-route validator also catches these, but the adapter must never
 *  send a private key to a third-party API even if the validator is bypassed. */
export function isExtendedPrivateKey(s: string): boolean {
  return /^([xyz]prv|[YZ]prv|[tuv]prv|[UV]prv)[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(s);
}

interface ChainStats {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

export const btcAdapter: BankAdapter = {
  id: "btc_address",
  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    const input = connection.address?.trim();
    if (!input) return { balances: [], transactions: {} };

    // Defence in depth: refuse private keys here too. Should never reach this
    // point because the connect route rejects them, but keeping the check
    // means a future code path that bypasses validation still can't leak one.
    if (isExtendedPrivateKey(input)) {
      throw new Error("Refusing to fetch: input is a private key (xprv/yprv/zprv). Use the extended PUBLIC key (xpub/ypub/zpub).");
    }

    const isXpub = isExtendedPublicKey(input);
    const path = isXpub
      ? `v1/xpub/${encodeURIComponent(input)}`
      : `address/${encodeURIComponent(input)}`;
    const url = `https://mempool.space/api/${path}`;

    const res = await fetchWithTimeout(url, {
      timeoutMs: MEMPOOL_TIMEOUT_MS,
      headers: { "User-Agent": "ledger-app", accept: "application/json" },
    });

    if (!res.ok) {
      // Plain address + 404 = address never seen → genuinely 0. That's honest.
      // xpub + 404 = mempool.space couldn't derive / doesn't recognize this
      // extended key shape; treating that as 0 would hide a real problem
      // (xpub typo, unsupported derivation scheme), so we surface it.
      if (res.status === 404 && !isXpub) {
        return {
          balances: [{ externalId: input, amount: new Decimal(0), currency: "BTC", asOf: new Date() }],
          transactions: {},
        };
      }
      const kind = isXpub ? "xpub" : "address";
      throw new Error(`mempool.space returned ${res.status} for ${kind} (${input.slice(0, 12)}…). ${isXpub ? "Check the xpub/zpub is correct — mempool.space supports xpub/ypub/zpub and their multisig variants." : ""}`);
    }

    const data = (await res.json()) as ChainStats;
    if (!data.chain_stats || typeof data.chain_stats.funded_txo_sum !== "number") {
      throw new Error(`Unexpected response shape from mempool.space ${isXpub ? "xpub" : "address"} endpoint`);
    }
    const confirmedSats =
      (data.chain_stats.funded_txo_sum ?? 0) - (data.chain_stats.spent_txo_sum ?? 0);
    const btc = new Decimal(confirmedSats).div(SAT_PER_BTC);
    return {
      balances: [{ externalId: input, amount: btc, currency: "BTC", asOf: new Date() }],
      transactions: {},
    };
  },
};
