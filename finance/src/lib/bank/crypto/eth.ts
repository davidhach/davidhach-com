/**
 * Ethereum address adapter. Reads a single ETH address's balance via
 * `eth_getBalance` against a public RPC. Defaults to cloudflare-eth.com (free,
 * no key) but accepts an override via the ETH_RPC_URL env var if you want
 * Ankr / Alchemy / Infura instead.
 *
 * Like the BTC adapter, we record balance only — no per-transaction sync.
 * That's enough to surface "I have X ETH" on the net-worth dashboard.
 */
import { Decimal } from "decimal.js";
import type { BankAdapter, SyncArgs, SyncResult } from "../types";

const WEI_PER_ETH = new Decimal("1000000000000000000");

function rpcUrl(): string {
  return process.env.ETH_RPC_URL ?? "https://cloudflare-eth.com";
}

export const ethAdapter: BankAdapter = {
  id: "eth_address",
  async sync({ connection }: SyncArgs): Promise<SyncResult> {
    const address = connection.address?.trim();
    if (!address) return { balances: [], transactions: {} };

    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) throw new Error(`ETH RPC returned ${res.status}`);
    const data = (await res.json()) as { result?: string; error?: { message?: string } };
    if (!data.result) throw new Error(data.error?.message ?? "ETH RPC: no result");

    // result is a hex-encoded wei value, e.g. "0x16345785d8a0000".
    const wei = new Decimal(BigInt(data.result).toString());
    const eth = wei.div(WEI_PER_ETH);
    return {
      balances: [{ externalId: address, amount: eth, currency: "ETH", asOf: new Date() }],
      transactions: {},
    };
  },
};
