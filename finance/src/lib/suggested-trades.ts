/**
 * Heuristic detector that turns a connected-cash Transaction into a candidate
 * BUY/SELL suggestion. Best-effort only — the user always confirms before any
 * AssetTransaction is created.
 *
 * Detects German + English keywords and tries to pull out quantity, price/unit,
 * and an instrument name. Misses are fine: those rows just don't appear.
 */
import { Decimal } from "decimal.js";

export interface TradeSignal {
  kind: "BUY" | "SELL";
  quantity?: string;
  pricePerUnit?: string;
  name?: string;        // best-guess instrument name pulled from description
  isin?: string;        // if found
}

const BUY_PATTERNS  = [/\bkauf(en)?\b/i, /\bbuy\b/i, /\border kauf\b/i, /\bord\b.*\bkauf\b/i, /\bcomprar\b/i];
const SELL_PATTERNS = [/\bverkauf(en)?\b/i, /\bsell\b/i, /\border verkauf\b/i, /\bord\b.*\bverkauf\b/i, /\bvender\b/i];
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

export function detectTrade(description: string, merchant?: string | null): TradeSignal | null {
  const text = `${description ?? ""} ${merchant ?? ""}`;
  let kind: "BUY" | "SELL" | null = null;
  if (BUY_PATTERNS.some((p) => p.test(text)))  kind = "BUY";
  else if (SELL_PATTERNS.some((p) => p.test(text))) kind = "SELL";
  if (!kind) return null;

  const signal: TradeSignal = { kind };

  const isinMatch = text.match(ISIN_RE);
  if (isinMatch) signal.isin = isinMatch[1];

  // "STK 4,5 ZU 175,30 EUR" / "4 SHARES @ 180.50" style.
  const qtyPriceMatch =
    text.match(/(?:STK|STÜCK|STUECK|UNITS|SHARES)\s*([\d.,]+)\s*(?:ZU|@|AT)\s*([\d.,]+)/i) ??
    text.match(/([\d.,]+)\s*(?:STK|STÜCK|STUECK|UNITS|SHARES)\s*(?:ZU|@|AT)\s*([\d.,]+)/i);
  if (qtyPriceMatch) {
    const q = parseDe(qtyPriceMatch[1]);
    const p = parseDe(qtyPriceMatch[2]);
    if (q) signal.quantity = q.toFixed(10);
    if (p) signal.pricePerUnit = p.toFixed(8);
  }

  // Pull anything that looks like an instrument name — short, all-caps-ish chunks.
  const nameMatch = text.replace(ISIN_RE, "").match(/\b([A-Z][A-Z &.\-/]{2,30})\b/);
  if (nameMatch) signal.name = nameMatch[1].trim();

  return signal;
}

function parseDe(s: string): Decimal | null {
  const cleaned = s.replace(/\s/g, "");
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let n = cleaned;
  if (lastDot >= 0 && lastComma >= 0) {
    n = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    n = cleaned.replace(",", ".");
  }
  try { return new Decimal(n); } catch { return null; }
}
