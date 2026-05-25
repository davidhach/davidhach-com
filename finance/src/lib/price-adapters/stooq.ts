/**
 * Stooq.com price feed. Free, no API key, returns CSV.
 *
 *   ref examples:
 *     "AAPL.US"     – Apple stock (NASDAQ)
 *     "SAP.DE"      – SAP AG (Xetra), price in EUR
 *     "MSFT.US"     – Microsoft
 *     "BTC.V"       – various
 *
 * NOTE on ISINs: Stooq does not accept ISINs directly. For ISIN-tagged assets,
 * users currently must enter the ticker too — the UI surfaces this as a
 * separate `externalRef` field. (Mapping ISIN → ticker requires a paid feed.)
 *
 * Stooq returns the price in the exchange's native currency. We hand back the
 * currency the exchange suffix implies so net-worth conversion is honest.
 */
import { Decimal } from "decimal.js";
import type { PriceQuote } from "./index";

const SUFFIX_CCY: Record<string, string> = {
  US: "USD", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR",
  CH: "CHF", JP: "JPY", HK: "HKD", AU: "AUD", CA: "CAD", PL: "PLN",
};

export async function fetchStooq(ref: string): Promise<PriceQuote | null> {
  const cleaned = ref.trim().toUpperCase();
  if (!cleaned) return null;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(cleaned.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { headers: { "User-Agent": "ledger-app" } });
  if (!res.ok) return null;
  const text = await res.text();
  return parseStooqCsv(text, cleaned);
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
  const currency = SUFFIX_CCY[suffix] ?? "USD";
  return {
    price: new Decimal(close),
    currency,
    date: new Date(dateStr),
  };
}
