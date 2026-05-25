/**
 * CoinGecko free price feed for crypto.
 *
 *   ref = the CoinGecko coin id, e.g. "bitcoin", "ethereum", "solana".
 *
 * Quoted in USD (then re-converted by our fx layer if the user wants EUR/etc).
 * No API key needed for low-volume reads.
 */
import { Decimal } from "decimal.js";
import type { PriceQuote } from "./index";

export async function fetchCoingecko(ref: string): Promise<PriceQuote | null> {
  const id = ref.trim().toLowerCase();
  if (!id) return null;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`;
  const res = await fetch(url, { headers: { "User-Agent": "ledger-app", accept: "application/json" } });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
  const row = json[id];
  if (!row?.usd) return null;
  return {
    price: new Decimal(row.usd),
    currency: "USD",
    date: row.last_updated_at ? new Date(row.last_updated_at * 1000) : new Date(),
  };
}
