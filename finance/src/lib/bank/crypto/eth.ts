/**
 * Ethereum address adapter. Reads a single ETH address's balance via
 * `eth_getBalance` (read-only — the adapter has no transaction-submission
 * method) against a list of free public RPCs with automatic failover.
 *
 * Cloudflare's previous default (cloudflare-eth.com) was discontinued and
 * returned "Internal error", which surfaced as a generic connection failure.
 * We now try three independent free endpoints in order and surface the actual
 * RPC errors when all of them fail.
 *
 *   primary  = process.env.ETH_RPC_URL (optional)
 *   fallback = publicnode → llamarpc → ankr  (any number, free, no key)
 */
import { Decimal } from "decimal.js";
import { fetchWithTimeout } from "../../net";
import type { BankAdapter, SyncArgs, SyncResult } from "../types";

const WEI_PER_ETH = 10n ** 18n;
const RPC_TIMEOUT_MS = 4000;

const DEFAULT_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
];

function rpcEndpoints(): string[] {
  const primary = process.env.ETH_RPC_URL?.trim();
  // Primary first (if configured), then the public fallbacks, deduped.
  const all = primary ? [primary, ...DEFAULT_RPCS] : DEFAULT_RPCS;
  return Array.from(new Set(all));
}

interface RpcResp { result?: string; error?: { code?: number; message?: string } }

/** Pure: convert a hex-wei string ("0x...") to a Decimal of ETH. Throws on garbage. */
export function hexWeiToEth(hex: string): Decimal {
  if (!hex || typeof hex !== "string") throw new Error(`empty result from RPC`);
  const wei = BigInt(hex);                 // throws if not a valid hex int
  // Divide as bigints to keep precision; convert quotient + remainder to Decimal.
  const whole = wei / WEI_PER_ETH;
  const rem = wei % WEI_PER_ETH;
  return new Decimal(whole.toString()).plus(new Decimal(rem.toString()).div(WEI_PER_ETH.toString()));
}

async function callRpc(url: string, address: string): Promise<{ eth: Decimal } | { error: string }> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json", "User-Agent": "ledger-app" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
      timeoutMs: RPC_TIMEOUT_MS,
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = (await res.json()) as RpcResp;
    if (data.error) return { error: data.error.message ?? `RPC error code ${data.error.code ?? "?"}` };
    if (!data.result) return { error: "RPC returned no result" };
    return { eth: hexWeiToEth(data.result) };
  } catch (e) {
    return { error: (e as Error).message || "transport error" };
  }
}

export const ethAdapter: BankAdapter = {
  id: "eth_address",
  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    const address = connection.address?.trim();
    if (!address) return { balances: [], transactions: {} };

    // Cheap shape check so we don't waste a round-trip on obvious garbage.
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Address "${address}" is not a valid 0x-prefixed 20-byte hex string`);
    }

    const endpoints = rpcEndpoints();
    const failures: string[] = [];
    for (const url of endpoints) {
      const r = await callRpc(url, address);
      if ("eth" in r) {
        return {
          balances: [{ externalId: address, amount: r.eth, currency: "ETH", asOf: new Date() }],
          transactions: {},
        };
      }
      failures.push(`${shortHost(url)}: ${r.error}`);
    }
    // All RPCs failed — surface the actual reasons, not a generic "Internal error".
    throw new Error(`All ETH RPC endpoints failed — ${failures.join(" | ")}`);
  },
};

function shortHost(u: string): string {
  try { return new URL(u).host; } catch { return u; }
}
