/**
 * ISIN → ticker resolver using OpenFIGI (free, no key required for low volume;
 * an API key in OPENFIGI_API_KEY raises the rate limit).
 *
 * Resolves the ISIN to a primary listing's ticker + exchange and maps it to a
 * Stooq symbol (e.g. "AAPL.US", "SAP.DE"). Results are cached in IsinMapping
 * so repeat resolutions are free.
 *
 * Returns null when no good match is found; caller falls back to manual entry.
 */
import { prisma } from "./db";

export interface IsinResult {
  isin: string;
  ticker: string;        // bare ticker, e.g. "AAPL"
  stooqRef: string;      // Stooq-formatted, e.g. "AAPL.US"
  name: string;
  exchange?: string;     // OpenFIGI exchCode
  marketCode?: string;   // OpenFIGI marketSector
  cached: boolean;
}

// Map OpenFIGI exchCode prefixes to Stooq exchange suffixes.
const EXCH_TO_STOOQ: Array<[RegExp, string]> = [
  [/^U[A-Z]?$/i, "US"],  // UN, UQ, UA, UP, US — US exchanges
  [/^GR$/i,      "DE"],  // Xetra
  [/^G[AFY]$/i,  "DE"],  // Frankfurt / others (best-effort)
  [/^LN$/i,      "UK"],
  [/^JP$/i,      "JP"],
  [/^SW$/i,      "CH"],
  [/^VX$/i,      "CH"],
  [/^FP$/i,      "FR"],
  [/^IM$/i,      "IT"],
  [/^HK$/i,      "HK"],
  [/^A[UT]$/i,   "AU"],
  [/^C[NT]$/i,   "CA"],
  [/^SP$/i,      "SG"],
  [/^SQ$/i,      "ES"],
  [/^NA$/i,      "NL"],
];

function exchToStooqSuffix(exch?: string): string | null {
  if (!exch) return null;
  for (const [re, suffix] of EXCH_TO_STOOQ) {
    if (re.test(exch)) return suffix;
  }
  return null;
}

export async function resolveIsin(isin: string): Promise<IsinResult | null> {
  const norm = isin.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(norm)) return null;

  // Cache hit — return immediately.
  const cached = await prisma.isinMapping.findUnique({ where: { isin: norm } });
  if (cached?.ticker && cached.stooqRef) {
    return {
      isin: norm,
      ticker: cached.ticker,
      stooqRef: cached.stooqRef,
      name: cached.name ?? cached.ticker,
      exchange: cached.exchange ?? undefined,
      marketCode: cached.marketCode ?? undefined,
      cached: true,
    };
  }

  const hit = await fetchOpenFigi(norm);
  if (!hit) {
    // Store an empty mapping to remember we tried; allows manual override later.
    await prisma.isinMapping.upsert({
      where: { isin: norm },
      create: { isin: norm },
      update: { fetchedAt: new Date() },
    });
    return null;
  }

  await prisma.isinMapping.upsert({
    where: { isin: norm },
    create: {
      isin: norm,
      ticker: hit.ticker,
      stooqRef: hit.stooqRef,
      name: hit.name,
      exchange: hit.exchange,
      marketCode: hit.marketCode,
    },
    update: {
      ticker: hit.ticker,
      stooqRef: hit.stooqRef,
      name: hit.name,
      exchange: hit.exchange,
      marketCode: hit.marketCode,
      fetchedAt: new Date(),
    },
  });
  return { ...hit, isin: norm, cached: false };
}

interface OpenFigiMatch {
  figi?: string;
  ticker?: string;
  exchCode?: string;
  name?: string;
  securityType?: string;
  securityType2?: string;
  marketSector?: string;
}

interface OpenFigiResp {
  data?: OpenFigiMatch[];
  error?: string;
  warning?: string;
}

async function fetchOpenFigi(isin: string): Promise<Omit<IsinResult, "isin" | "cached"> | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.OPENFIGI_API_KEY;
  if (key) headers["X-OPENFIGI-APIKEY"] = key;

  const res = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers,
    body: JSON.stringify([{ idType: "ID_ISIN", idValue: isin }]),
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as OpenFigiResp[];
  const entry = arr?.[0];
  if (!entry?.data?.length) return null;

  // Prefer matches that have both a ticker AND map to a known Stooq exchange.
  // Then prefer Common Stock / ADR / ETF over warrants etc.
  const candidates = entry.data
    .map((m) => ({ m, suffix: exchToStooqSuffix(m.exchCode) }))
    .filter((x) => x.m.ticker && x.suffix);
  if (candidates.length === 0) return null;

  const preferredTypes = ["Common Stock", "REIT", "Depositary Receipt", "ETP", "ADR"];
  const ranked = candidates.sort((a, b) => {
    const aT = preferredTypes.indexOf(a.m.securityType ?? a.m.securityType2 ?? "");
    const bT = preferredTypes.indexOf(b.m.securityType ?? b.m.securityType2 ?? "");
    if (aT === bT) return 0;
    if (aT === -1) return 1;
    if (bT === -1) return -1;
    return aT - bT;
  });
  const best = ranked[0];
  const ticker = best.m.ticker!.trim().toUpperCase();
  const suffix = best.suffix!;
  return {
    ticker,
    stooqRef: `${ticker}.${suffix}`,
    name: best.m.name ?? ticker,
    exchange: best.m.exchCode,
    marketCode: best.m.marketSector,
  };
}
