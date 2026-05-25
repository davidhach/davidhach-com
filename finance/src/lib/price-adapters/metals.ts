/**
 * Precious-metals price feed. Re-uses Stooq under the hood with these refs:
 *   GOLD   →  xauusd  (USD/oz)
 *   SILVER →  xagusd  (USD/oz)
 *   PLATINUM → xptusd
 *   PALLADIUM → xpdusd
 *
 * For "OTHERS" (per the brief), the user must supply a raw Stooq symbol —
 * we accept it as-is and let Stooq say yea or nay.
 */
import { fetchStooq } from "./stooq";
import type { PriceQuote } from "./index";

const ALIASES: Record<string, string> = {
  GOLD:      "xauusd",
  SILVER:    "xagusd",
  PLATINUM:  "xptusd",
  PALLADIUM: "xpdusd",
};

export async function fetchMetal(ref: string): Promise<PriceQuote | null> {
  const key = ref.trim().toUpperCase();
  const symbol = ALIASES[key] ?? ref;
  return fetchStooq(symbol);
}
