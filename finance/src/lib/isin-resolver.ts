/**
 * ISIN → ticker resolver using OpenFIGI (free, no key required for low volume;
 * an API key in OPENFIGI_API_KEY raises the rate limit).
 *
 * Strategy:
 *   1. Cache lookup. If we have a previous mapping that still returns a quote,
 *      reuse it.
 *   2. Otherwise call OpenFIGI.
 *   3. Score every candidate listing by:
 *        a) currency match against the caller's `preferredCurrency` (huge bonus
 *           — fixes the LU0908500753 case where MEUD.UK was picked for a EUR
 *           ETF, returning pence and a wild value),
 *        b) home-exchange match against the ISIN country prefix,
 *        c) security-type preference (Common Stock / ETP first).
 *   4. Walk candidates in score order, doing a LIVE Stooq fetch on each. Pick
 *      the first one that actually returns a quote.
 *   5. If nothing works, persist a "tried but empty" mapping so we don't hit
 *      OpenFIGI repeatedly, and return null — caller falls back to manual.
 */
import { prisma } from "./db";
import { fetchStooq, stooqCurrencyForSuffix } from "./price-adapters/stooq";

export interface IsinResult {
  isin: string;
  ticker: string;        // bare ticker, e.g. "AAPL"
  stooqRef: string;      // Stooq-formatted, e.g. "AAPL.US"
  name: string;
  exchange?: string;     // OpenFIGI exchCode
  marketCode?: string;   // OpenFIGI marketSector
  currency?: string;     // Stooq native currency for the picked listing
  cached: boolean;
}

// OpenFIGI exchCode → Stooq exchange suffix.
const EXCH_TO_STOOQ: Array<[RegExp, string]> = [
  [/^U[A-Z]?$/i, "US"],
  [/^GR$/i,      "DE"],   // Xetra
  [/^G[AFY]$/i,  "DE"],   // Frankfurt et al
  [/^LN$/i,      "UK"],
  [/^JP$/i,      "JP"],
  [/^SW$/i,      "CH"],
  [/^VX$/i,      "CH"],
  [/^FP$/i,      "FR"],   // Euronext Paris
  [/^IM$/i,      "IT"],
  [/^HK$/i,      "HK"],
  [/^A[UT]$/i,   "AU"],
  [/^C[NT]$/i,   "CA"],
  [/^SP$/i,      "SG"],
  [/^SQ$/i,      "ES"],
  [/^NA$/i,      "NL"],
  [/^BB$/i,      "BE"],
  [/^PL$/i,      "PT"],
  [/^ID$/i,      "IE"],
  [/^AV$/i,      "AT"],
];

function exchToStooqSuffix(exch?: string): string | null {
  if (!exch) return null;
  for (const [re, suffix] of EXCH_TO_STOOQ) if (re.test(exch)) return suffix;
  return null;
}

// ISIN country prefix → preferred Stooq suffix(es), most-preferred first.
const ISIN_HOME: Record<string, string[]> = {
  US: ["US"],
  GB: ["UK"],
  DE: ["DE"],
  FR: ["FR", "DE"],            // French ETFs often dual-listed on Xetra
  IT: ["IT"],
  ES: ["ES"],
  NL: ["NL", "DE"],
  BE: ["BE", "DE"],
  IE: ["IE", "DE", "FR"],
  AT: ["AT", "DE"],
  PT: ["PT", "ES"],
  CH: ["CH"],
  JP: ["JP"],
  HK: ["HK"],
  AU: ["AU"],
  CA: ["CA"],
  // Luxembourg-domiciled UCITS ETFs typically list across multiple EU venues;
  // Paris and Xetra are the most common primary listings.
  LU: ["FR", "DE", "NL", "IT"],
};

export async function resolveIsin(
  isin: string,
  opts?: { preferredCurrency?: string },
): Promise<IsinResult | null> {
  const norm = isin.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(norm)) return null;
  const preferredCurrency = opts?.preferredCurrency?.toUpperCase();

  // Cache hit — but VALIDATE it. If the cached listing has gone dark or its
  // currency doesn't match what the caller now wants, re-resolve.
  const cached = await prisma.isinMapping.findUnique({ where: { isin: norm } });
  if (cached?.stooqRef) {
    const cachedCurrency = stooqCurrencyForSuffix(cached.stooqRef.split(".").pop());
    const currencyOk = !preferredCurrency || cachedCurrency === preferredCurrency;
    if (currencyOk) {
      const quote = await fetchStooq(cached.stooqRef).catch(() => null);
      if (quote) {
        return {
          isin: norm,
          ticker: cached.ticker ?? cached.stooqRef.split(".")[0],
          stooqRef: cached.stooqRef,
          name: cached.name ?? cached.ticker ?? cached.stooqRef,
          exchange: cached.exchange ?? undefined,
          marketCode: cached.marketCode ?? undefined,
          currency: quote.currency,
          cached: true,
        };
      }
    }
    // Cached pick failed validation → fall through and re-resolve.
  }

  const hit = await fetchOpenFigiAndPick(norm, preferredCurrency);
  if (!hit) {
    await prisma.isinMapping.upsert({
      where: { isin: norm },
      create: { isin: norm },
      update: { fetchedAt: new Date() },
    });
    return null;
  }

  await prisma.isinMapping.upsert({
    where: { isin: norm },
    create: { isin: norm, ticker: hit.ticker, stooqRef: hit.stooqRef, name: hit.name, exchange: hit.exchange, marketCode: hit.marketCode },
    update: { ticker: hit.ticker, stooqRef: hit.stooqRef, name: hit.name, exchange: hit.exchange, marketCode: hit.marketCode, fetchedAt: new Date() },
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

interface Candidate {
  m: OpenFigiMatch;
  suffix: string;
  currency: string;
  score: number;
}

async function fetchOpenFigiAndPick(
  isin: string,
  preferredCurrency: string | undefined,
): Promise<Omit<IsinResult, "isin" | "cached"> | null> {
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
  const matches = arr?.[0]?.data ?? [];
  if (matches.length === 0) return null;

  const isinCountry = isin.slice(0, 2);
  const homeSuffixes = ISIN_HOME[isinCountry] ?? [];

  const PREFERRED_TYPES = ["Common Stock", "REIT", "Depositary Receipt", "ETP", "ETF", "ADR", "Fund"];
  const candidates: Candidate[] = matches
    .map((m): Candidate | null => {
      const suffix = exchToStooqSuffix(m.exchCode);
      if (!m.ticker || !suffix) return null;
      const currency = stooqCurrencyForSuffix(suffix);
      let score = 0;
      // 1) Currency match — biggest signal. A EUR-stated asset should never
      // pick a UK pence listing just because OpenFIGI returned it first.
      if (preferredCurrency && currency === preferredCurrency) score += 100;
      // 2) Home-exchange match for the ISIN country.
      const homeIdx = homeSuffixes.indexOf(suffix);
      if (homeIdx >= 0) score += 50 - homeIdx * 5;
      // 3) Preferred security type.
      const t = m.securityType ?? m.securityType2 ?? "";
      const ti = PREFERRED_TYPES.indexOf(t);
      if (ti >= 0) score += 10 - ti;
      // 4) Tiebreaker: shorter, cleaner tickers first.
      score -= Math.min(m.ticker.length, 10) * 0.1;
      return { m, suffix, currency, score };
    })
    .filter((x): x is Candidate => x !== null)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;

  // Validate by fetching a live quote — first candidate that returns one wins.
  // Cap the lookups so a giant OpenFIGI response doesn't burn through Stooq.
  for (const c of candidates.slice(0, 8)) {
    const ticker = c.m.ticker!.trim().toUpperCase();
    const stooqRef = `${ticker}.${c.suffix}`;
    const quote = await fetchStooq(stooqRef).catch(() => null);
    if (!quote) continue;
    return {
      ticker,
      stooqRef,
      name: c.m.name ?? ticker,
      exchange: c.m.exchCode,
      marketCode: c.m.marketSector,
      currency: quote.currency,
    };
  }
  return null;
}
