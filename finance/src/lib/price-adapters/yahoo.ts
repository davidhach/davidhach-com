/**
 * Yahoo Finance fallback adapter (chart endpoint — same one yahoo.com uses).
 *
 *   https://query1.finance.yahoo.com/v8/finance/chart/MEUD.PA?interval=1d&range=5d
 *
 * Free, no API key, generally accessible without auth. We call it as a
 * SECONDARY source: refreshAssetPrice tries Stooq first (where we have
 * historical CSV), then falls through to Yahoo when Stooq has no quote — the
 * common failure mode for thin-volume UCITS ETFs like MEUD.*
 *
 * Symbol convention: Yahoo uses its own exchange suffixes that differ from
 * Stooq. We accept either a Yahoo-native ref (e.g. "MEUD.PA") OR a Stooq-style
 * ref (e.g. "MEUD.FR") and convert. LSE pence quotes (`currency: "GBp"`) are
 * converted to GBP × 0.01 so values are always in major units.
 */
import { Decimal } from "decimal.js";
import { fetchWithTimeout } from "../net";
import type { PriceQuote } from "./index";

// Stooq suffix → Yahoo suffix.
const STOOQ_TO_YAHOO: Record<string, string> = {
  US: "",     // Yahoo bare ticker for US
  UK: ".L",   // LSE (pence!)
  DE: ".DE",  // Xetra
  FR: ".PA",  // Paris
  IT: ".MI",  // Milano
  ES: ".MC",  // Madrid
  NL: ".AS",  // Amsterdam
  BE: ".BR",  // Brussels
  PT: ".LS",  // Lisbon
  IE: ".IR",
  AT: ".VI",  // Vienna
  CH: ".SW",  // SIX Swiss
  JP: ".T",   // Tokyo
  HK: ".HK",
  AU: ".AX",
  CA: ".TO",
  SG: ".SI",
  PL: ".WA",
};

/** Convert a Stooq-style ref to a Yahoo-style symbol. Pass-through if it already looks like Yahoo. */
export function stooqRefToYahoo(ref: string): string {
  const cleaned = ref.trim().toUpperCase();
  if (!cleaned.includes(".")) return cleaned;        // bare ticker = US on Yahoo
  const [base, suffix] = cleaned.split(".");
  // If it's already a Yahoo suffix (.L, .PA, .DE …), keep it.
  if (Object.values(STOOQ_TO_YAHOO).includes(`.${suffix}`)) return cleaned;
  const ySuffix = STOOQ_TO_YAHOO[suffix];
  if (ySuffix === undefined) return cleaned;          // unknown — let Yahoo decide
  return ySuffix ? `${base}${ySuffix}` : base;
}

interface YahooChartResp {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
    }>;
    error?: { code?: string; description?: string };
  };
}

export async function fetchYahoo(ref: string): Promise<PriceQuote | null> {
  const symbol = stooqRefToYahoo(ref);
  if (!symbol) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 3500,
      headers: { "User-Agent": "Mozilla/5.0 ledger-app", accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResp;
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose ?? meta?.chartPreviousClose;
    if (price == null || !Number.isFinite(price) || price <= 0) return null;

    // LSE pence handling: Yahoo reports `currency: "GBp"` for London-listed
    // shares quoted in pence. Convert to GBP × 0.01 so consumers always work
    // in major units.
    let currency = meta?.currency ?? "USD";
    let majorPrice = new Decimal(price);
    if (currency === "GBp" || currency === "GBX") {
      currency = "GBP";
      majorPrice = majorPrice.mul("0.01");
    }
    const ts = meta?.regularMarketTime;
    return {
      price: majorPrice,
      currency,
      date: ts ? new Date(ts * 1000) : new Date(),
    };
  } catch {
    return null;
  }
}
