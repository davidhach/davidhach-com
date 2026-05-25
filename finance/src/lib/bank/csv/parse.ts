/**
 * Minimal bank-statement CSV parser. Zero external deps — bank CSVs are
 * well-formed enough that a 100-line tokenizer covers the common ones we
 * care about (Sparkasse, Consors, N26, generic exports).
 *
 * Auto-detects:
 *   - delimiter (',' or ';')
 *   - decimal separator ('.' or ',')
 *   - date format (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, MM/DD/YYYY)
 *   - column meaning, by matching header names against a small dictionary.
 *
 * Returns ExtractedTransaction[] — the same shape the OCR pipeline emits, so
 * the existing review flow can be reused.
 */
import { Decimal } from "decimal.js";

export interface ParsedRow {
  date: string;            // YYYY-MM-DD
  amount: string;          // signed string with up to 2 decimals
  currency: string;        // ISO 4217
  description: string;
  merchant?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  delimiter: string;
  columns: ColumnMap;
}

interface ColumnMap {
  date: number;
  amount: number;
  description: number;
  merchant?: number;
  currency?: number;
  debit?: number;          // some CSVs split debit/credit across two cols
  credit?: number;
}

const DATE_HEADERS        = ["date", "buchungstag", "buchung", "valuta", "valutadatum", "wertstellung", "booking date", "transaction date"];
const AMOUNT_HEADERS      = ["amount", "betrag", "umsatz", "value"];
const DEBIT_HEADERS       = ["debit", "soll", "auszahlung", "outflow"];
const CREDIT_HEADERS      = ["credit", "haben", "einzahlung", "inflow"];
const DESC_HEADERS        = ["description", "verwendungszweck", "buchungstext", "details", "memo", "notes", "subject"];
const MERCHANT_HEADERS    = ["merchant", "payee", "auftraggeber", "empfänger", "empfaenger", "name", "counterparty", "beneficiary"];
const CURRENCY_HEADERS    = ["currency", "waehrung", "währung", "ccy"];

export function parseBankCsv(text: string, defaultCurrency = "EUR"): ParseResult {
  const warnings: string[] = [];
  const cleaned = text.replace(/^﻿/, "");
  const { delimiter, lines } = detectDelimiter(cleaned);
  if (lines.length < 2) return { rows: [], warnings: ["File has no data rows."], delimiter, columns: emptyCols() };

  // Some banks prefix with metadata lines before the real header. Try each row
  // in turn until column-detection succeeds.
  let headerIdx = -1;
  let columns: ColumnMap = emptyCols();
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = splitRow(lines[i], delimiter);
    const detected = detectColumns(cols);
    if (detected.date >= 0 && (detected.amount >= 0 || (detected.debit !== undefined && detected.credit !== undefined))) {
      headerIdx = i; columns = detected; break;
    }
  }
  if (headerIdx < 0) {
    return { rows: [], warnings: ["Could not detect header row (need a date column and an amount/debit+credit pair)."], delimiter, columns };
  }

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitRow(lines[i], delimiter);
    const dateStr = cols[columns.date]?.trim();
    if (!dateStr) continue;
    const date = parseDate(dateStr);
    if (!date) { warnings.push(`Row ${i + 1}: unparseable date "${dateStr}"`); continue; }

    let amount: Decimal | null = null;
    if (columns.amount >= 0) {
      amount = parseDecimal(cols[columns.amount] ?? "");
    } else if (columns.debit !== undefined && columns.credit !== undefined) {
      const d = parseDecimal(cols[columns.debit] ?? "");
      const c = parseDecimal(cols[columns.credit] ?? "");
      amount = c && !c.isZero() ? c : (d ? d.neg() : null);
    }
    if (amount === null) { warnings.push(`Row ${i + 1}: missing amount`); continue; }

    rows.push({
      date,
      amount: amount.toFixed(2),
      currency: (columns.currency !== undefined ? cols[columns.currency]?.trim().toUpperCase() : "") || defaultCurrency,
      description: (cols[columns.description] ?? "").trim() || "—",
      merchant: columns.merchant !== undefined ? (cols[columns.merchant]?.trim() || undefined) : undefined,
    });
  }
  return { rows, warnings, delimiter, columns };
}

// ─── Internals ─────────────────────────────────────────────────────────────

function emptyCols(): ColumnMap {
  return { date: -1, amount: -1, description: -1 };
}

function detectDelimiter(text: string): { delimiter: string; lines: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const sample = lines.slice(0, 5).join("\n");
  const semi = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  return { delimiter: semi > comma ? ";" : ",", lines };
}

function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function detectColumns(headers: string[]): ColumnMap {
  const norm = headers.map((h) => h.toLowerCase().trim().replace(/^"|"$/g, ""));
  const find = (dict: string[]) => norm.findIndex((h) => dict.some((d) => h.includes(d)));
  const cols: ColumnMap = {
    date: find(DATE_HEADERS),
    amount: find(AMOUNT_HEADERS),
    description: find(DESC_HEADERS),
  };
  const debit = find(DEBIT_HEADERS);
  const credit = find(CREDIT_HEADERS);
  if (debit >= 0)  cols.debit = debit;
  if (credit >= 0) cols.credit = credit;
  const merchant = find(MERCHANT_HEADERS);
  if (merchant >= 0) cols.merchant = merchant;
  const currency = find(CURRENCY_HEADERS);
  if (currency >= 0) cols.currency = currency;
  if (cols.description < 0) {
    // Fall back to the first non-numeric, non-date string column.
    cols.description = norm.findIndex((h, i) =>
      i !== cols.date && i !== cols.amount && i !== cols.merchant && h.length > 0,
    );
  }
  return cols;
}

function parseDate(s: string): string | null {
  const v = s.trim();
  // YYYY-MM-DD
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD.MM.YYYY  (German)
  m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  // DD/MM/YYYY  (rest-of-world)
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  // YYYY/MM/DD
  m = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}
function pad(s: string) { return s.length === 1 ? `0${s}` : s; }

function parseDecimal(raw: string): Decimal | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/"/g, "");
  if (!cleaned) return null;
  // If both . and , are present, the rightmost separator wins as decimal.
  let normalised = cleaned;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) normalised = cleaned.replace(/\./g, "").replace(",", ".");
    else                     normalised = cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalised = cleaned.replace(",", ".");
  }
  try { return new Decimal(normalised); } catch { return null; }
}
