/**
 * Price-adapter registry.
 *
 * Each adapter fetches the most recent price for one asset from a free source
 * and returns { price, currency, date }. Adapters return null when the ref
 * doesn't resolve — never throw a generic error, so the cron can keep going
 * for the next asset.
 *
 * Adapters are looked up by Asset.priceSource (a free-form string column so we
 * can add adapters without a schema migration). The special source "manual"
 * means "don't auto-refresh" — the user maintains values via the bulk-update
 * workflow.
 */
import { Decimal } from "decimal.js";
import { fetchStooq } from "./stooq";
import { fetchCoingecko } from "./coingecko";
import { fetchMetal } from "./metals";

export interface PriceQuote {
  price: Decimal;
  currency: string;
  date: Date;
}

export interface PriceAdapter {
  id: string;
  /** Returns null if the ref doesn't resolve. Throws only for transport errors. */
  fetch(ref: string): Promise<PriceQuote | null>;
}

const REGISTRY: Record<string, PriceAdapter> = {
  stooq:      { id: "stooq",      fetch: fetchStooq },
  coingecko:  { id: "coingecko",  fetch: fetchCoingecko },
  metals:     { id: "metals",     fetch: fetchMetal },
};

export function getAdapter(id: string): PriceAdapter | null {
  return REGISTRY[id] ?? null;
}

export const ADAPTER_IDS = Object.keys(REGISTRY);
export const MANUAL_SOURCE = "manual";
