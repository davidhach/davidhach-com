/**
 * Broker DEPOT (positions) CSV parser.
 *
 * Brokers (Comdirect, Consors, etc.) export depot positions as CSV with a few
 * common shapes. We detect columns by header heuristics — same approach as the
 * transaction CSV parser. Output rows are normalised to { isin?, ticker?, name,
 * quantity, avgPrice?, currency }.
 *
 * Why CSV: PSD2 / open-banking does NOT expose depot positions for German
 * brokers. The honest path is to ask the user to export the depot from their
 * online banking and drop the file here.
 */
import { Decimal } from "decimal.js";

export interface DepotRow {
  isin?: string;
  ticker?: string;
  name: string;
  quantity: string;       // positive decimal
  avgPrice?: string;      // per-unit, in currency
  currency: string;
}

export interface DepotParseResult {
  rows: DepotRow[];
  warnings: string[];
  delimiter: string;
}

const ISIN_HEADERS  = ["isin", "wkn"];
const NAME_HEADERS  = ["name", "bezeichnung", "wertpapier", "security", "instrument"];
const QTY_HEADERS   = ["quantity", "stück", "stueck", "anzahl", "units", "shares"];
const PRICE_HEADERS = ["price", "kaufkurs", "einstand", "avg", "average", "cost"];
const CCY_HEADERS   = ["currency", "waehrung", "währung", "ccy"];
const TICKER_HEADERS = ["ticker", "symbol"];

export function parseDepotCsv(text: string, defaultCurrency = "EUR"): DepotParseResult {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return { rows: [], warnings: ["File has no data rows."], delimiter: "," };

  const sample = lines.slice(0, 5).join("\n");
  const delimiter = (sample.match(/;/g) ?? []).length > (sample.match(/,/g) ?? []).length ? ";" : ",";

  // Find the header row.
  let headerIdx = -1;
  let cols: ReturnType<typeof detectCols> = { name: -1, qty: -1 };
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const row = split(lines[i], delimiter);
    const c = detectCols(row);
    if (c.name >= 0 && c.qty >= 0) { headerIdx = i; cols = c; break; }
  }
  if (headerIdx < 0) {
    return { rows: [], warnings: ["Couldn't detect header (need a name/security column and a quantity column)."], delimiter };
  }

  const warnings: string[] = [];
  const rows: DepotRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = split(lines[i], delimiter);
    const qty = parseDecimal(row[cols.qty]);
    if (!qty || qty.lte(0)) continue;
    const name = (row[cols.name] ?? "").trim();
    if (!name) continue;
    rows.push({
      isin: cols.isin !== undefined ? validIsin(row[cols.isin]) : undefined,
      ticker: cols.ticker !== undefined ? row[cols.ticker]?.trim().toUpperCase() : undefined,
      name,
      quantity: qty.toFixed(10),
      avgPrice: cols.price !== undefined ? (parseDecimal(row[cols.price])?.toFixed(8) ?? undefined) : undefined,
      currency: (cols.ccy !== undefined ? row[cols.ccy]?.trim().toUpperCase() : "") || defaultCurrency,
    });
  }
  return { rows, warnings, delimiter };
}

interface Cols {
  name: number; qty: number;
  isin?: number; ticker?: number; price?: number; ccy?: number;
}
function detectCols(headers: string[]): Cols {
  const norm = headers.map((h) => h.toLowerCase().trim().replace(/^"|"$/g, ""));
  const find = (dict: string[]) => norm.findIndex((h) => dict.some((d) => h.includes(d)));
  const c: Cols = { name: find(NAME_HEADERS), qty: find(QTY_HEADERS) };
  const isin = find(ISIN_HEADERS); if (isin >= 0) c.isin = isin;
  const ticker = find(TICKER_HEADERS); if (ticker >= 0) c.ticker = ticker;
  const price = find(PRICE_HEADERS); if (price >= 0) c.price = price;
  const ccy = find(CCY_HEADERS); if (ccy >= 0) c.ccy = ccy;
  return c;
}

function split(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === delim && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function validIsin(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v) ? v : undefined;
}

function parseDecimal(raw: string | undefined): Decimal | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace(/"/g, "");
  if (!s) return null;
  let n = s;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    n = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    n = s.replace(",", ".");
  }
  try { return new Decimal(n); } catch { return null; }
}
