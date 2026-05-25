/**
 * Stooq.com price feed. Free, no API key, returns CSV.
 *
 *   ref examples:
 *     "AAPL.US"   – Apple stock (NASDAQ), price in USD.
 *     "SAP.DE"    – SAP AG (Xetra), price in EUR.
 *     "MEUD.UK"   – LSE listing, price returned in PENCE — we divide by 100
 *                   and report GBP. This is the LSE convention on Stooq.
 *
 * Stooq returns the price in the exchange's native unit. The suffix table
 * below tells us both the currency AND the unit scale to apply so the value
 * we hand back is always in major units (GBP not GBp, EUR not EUR cents).
 */
import { Decimal } from "decimal.js";
import { fetchWithTimeout } from "../net";
import type { PriceQuote } from "./index";

// Each suffix maps to { currency, unitScale }. unitScale multiplies the raw
// Stooq close — e.g. UK is 0.01 because LSE quotes are in pence.
const SUFFIX: Record<string, { currency: string; unitScale: number }> = {
  US: { currency: "USD", unitScale: 1 },
  UK: { currency: "GBP", unitScale: 0.01 },
  DE: { currency: "EUR", unitScale: 1 },
  FR: { currency: "EUR", unitScale: 1 },
  IT: { currency: "EUR", unitScale: 1 },
  ES: { currency: "EUR", unitScale: 1 },
  NL: { currency: "EUR", unitScale: 1 },
  BE: { currency: "EUR", unitScale: 1 },
  PT: { currency: "EUR", unitScale: 1 },
  IE: { currency: "EUR", unitScale: 1 },
  AT: { currency: "EUR", unitScale: 1 },
  CH: { currency: "CHF", unitScale: 1 },
  JP: { currency: "JPY", unitScale: 1 },
  HK: { currency: "HKD", unitScale: 1 },
  AU: { currency: "AUD", unitScale: 1 },
  CA: { currency: "CAD", unitScale: 1 },
  PL: { currency: "PLN", unitScale: 1 },
  SG: { currency: "SGD", unitScale: 1 },
};

/** Currency code Stooq returns for a given suffix (or USD as fallback). Exported for the resolver's currency-preference ranking. */
export function stooqCurrencyForSuffix(suffix?: string | null): string {
  if (!suffix) return "USD";
  return SUFFIX[suffix.toUpperCase()]?.currency ?? "USD";
}

export async function fetchStooq(ref: string): Promise<PriceQuote | null> {
  const cleaned = ref.trim().toUpperCase();
  if (!cleaned) return null;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(cleaned.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 3000,
      headers: { "User-Agent": "ledger-app" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseStooqCsv(text, cleaned);
  } catch {
    return null;
  }
}

export function parseStooqCsv(text: string, ref: string): PriceQuote | null {
  // Header: Symbol,Date,Time,Open,High,Low,Close,Volume
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const row = lines[1].split(",");
  if (row.length < 7) return null;
  const dateStr = row[1];
  const close = row[6];
  if (!dateStr || !close || close === "N/D") return null;
  const suffix = ref.includes(".") ? ref.split(".").pop()! : "US";
  const info = SUFFIX[suffix] ?? { currency: "USD", unitScale: 1 };
  const raw = new Decimal(close);
  // Reject obviously garbage values that would explode portfolios. Stooq
  // occasionally returns weird negatives or zero on data hiccups.
  if (raw.lte(0) || !raw.isFinite()) return null;
  return {
    price: info.unitScale === 1 ? raw : raw.mul(info.unitScale),
    currency: info.currency,
    date: new Date(dateStr),
  };
}
