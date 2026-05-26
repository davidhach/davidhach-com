/**
 * FX cache + safe conversion.
 *
 * Hard rule: `convertSafe` MUST NEVER throw AND MUST NEVER fabricate a rate.
 * If we can't find a real rate (cached, on-demand-fetched, or any historical
 * row for the same pair), it returns ok:false and the original amount
 * untouched. Callers MUST check `ok` and skip / surface a warning — never
 * sum a foreign amount into the display-currency total.
 *
 * Missing-rate fallback order:
 *   1. Use the most recent cached rate for that quote (any prior date).
 *   2. On-demand single-pair fetch (`ensureFxRate`) for a closer date.
 *   3. Any cached rate for that pair, even from after the requested date
 *      (marked stale:true).
 *   4. Fall through: return original amount + ok:false + reason.
 *
 * Data sources (both free, no key required):
 *   - PRIMARY:  open.er-api.com — broad coverage (~161 currencies inc IDR/THB).
 *   - FALLBACK: frankfurter.app — ECB rates, narrower coverage but reliable.
 *
 * `convert` is kept as a thin wrapper that throws — only the cron uses it,
 * and only because that's the cron's idiomatic style. New callers should use
 * `convertSafe`.
 */
import { prisma } from "./db";
import { Decimal } from "decimal.js";
import { fetchWithTimeout } from "./net";

const BASE = process.env.FX_BASE ?? "USD";
const ONE = new Decimal(1);
const FX_TIMEOUT_MS = 5000;

// ─── External providers ────────────────────────────────────────────────────
//
// Both providers normalize to `{ rates: { QUOTE: number } }` shape after parse.
// Returns null on any failure so the caller can fall through to the next.

interface ProviderRates {
  rates: Record<string, number>;
  source: string;
}

/** open.er-api.com — broad coverage incl. IDR/THB. Latest only (no history). */
async function fetchOpenEr(base: string): Promise<ProviderRates | null> {
  try {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const res = await fetchWithTimeout(url, { timeoutMs: FX_TIMEOUT_MS, headers: { "User-Agent": "ledger-app" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== "success" || !json.rates) return null;
    return { rates: json.rates, source: "open.er-api" };
  } catch { return null; }
}

/** frankfurter.app — ECB rates. Narrower (no IDR/THB) but supports historical dates. */
async function fetchFrankfurter(base: string, date?: Date): Promise<ProviderRates | null> {
  try {
    const path = date ? date.toISOString().slice(0, 10) : "latest";
    const url = `https://api.frankfurter.app/${path}?from=${encodeURIComponent(base)}`;
    const res = await fetchWithTimeout(url, { timeoutMs: FX_TIMEOUT_MS, headers: { "User-Agent": "ledger-app" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    if (!json.rates) return null;
    return { rates: json.rates, source: "frankfurter" };
  } catch { return null; }
}

// ─── Cache refresh ─────────────────────────────────────────────────────────

/** Daily cron refresh — pulls the full set from the primary, falls back if it's down. */
export async function refreshFxRates(forDate?: Date): Promise<number> {
  const date = forDate ?? new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const day = new Date(dateStr);

  // Today's snapshot — primary first, fallback if it's down. We don't try to
  // backfill historical dates here (open-er-api is latest-only); the cron is
  // best-effort daily, and convertSafe handles stale-rate fallback per row.
  const primary = await fetchOpenEr(BASE);
  const fallback = primary ?? await fetchFrankfurter(BASE);
  if (!fallback) {
    throw new Error("All FX providers failed (open.er-api + frankfurter)");
  }
  const entries = Object.entries(fallback.rates).filter(([, r]) => Number.isFinite(r) && r > 0);
  await prisma.$transaction(
    entries.map(([quote, rate]) =>
      prisma.fxRate.upsert({
        where: { date_base_quote: { date: day, base: BASE, quote } },
        create: { date: day, base: BASE, quote, rate: new Decimal(rate), source: fallback.source },
        update: { rate: new Decimal(rate), source: fallback.source },
      }),
    ),
  );

  // Best-effort: if the primary set missed a currency the user actually holds
  // (rare; e.g. a thinly-traded code), try a single-pair fetch.
  const used = await usedCurrencies();
  const wanted = used.filter((c) => c !== BASE && !fallback.rates[c]);
  for (const q of wanted) {
    await ensureFxRate(q, date).catch(() => {});
  }
  return entries.length;
}

/** Collect every distinct non-null currency referenced across Assets / Liabilities / FinAccounts. */
async function usedCurrencies(): Promise<string[]> {
  const [a, l, f, u] = await Promise.all([
    prisma.asset.findMany({ select: { currency: true } }),
    prisma.liability.findMany({ select: { currency: true } }),
    prisma.finAccount.findMany({ select: { currency: true } }),
    prisma.user.findMany({ select: { displayCurrency: true } }),
  ]);
  const set = new Set<string>();
  for (const x of a) set.add(x.currency);
  for (const x of l) set.add(x.currency);
  for (const x of f) set.add(x.currency);
  for (const x of u) set.add(x.displayCurrency);
  return [...set];
}

/**
 * Fetch a single pair on demand and cache it for the given date. Used both by
 * the cron (for currencies the bulk endpoint missed) and by convertSafe when
 * neither today's nor any prior rate is cached.
 *
 * Returns the cached row, or null on transport failure.
 */
export async function ensureFxRate(quote: string, date: Date = new Date()) {
  if (quote === BASE) return null;
  const dateStr = date.toISOString().slice(0, 10);
  const day = new Date(dateStr);
  // If we already have something for that day, no-op.
  const existing = await prisma.fxRate.findUnique({
    where: { date_base_quote: { date: day, base: BASE, quote } },
  });
  if (existing) return existing;

  // Try primary, then fallback. Both are single-call providers — we pull the
  // full set and pick out the one quote we want. Cheaper than caching only
  // what's asked because most calls are for the same handful of currencies.
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  // open-er-api is latest-only; for historical dates, skip straight to frankfurter.
  const provider = isToday
    ? (await fetchOpenEr(BASE)) ?? await fetchFrankfurter(BASE, day)
    : await fetchFrankfurter(BASE, day);
  if (!provider) return null;
  const rate = provider.rates[quote];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return prisma.fxRate.upsert({
    where: { date_base_quote: { date: day, base: BASE, quote } },
    create: { date: day, base: BASE, quote, rate: new Decimal(rate), source: provider.source },
    update: { rate: new Decimal(rate), source: provider.source },
  });
}

// ─── Conversion ────────────────────────────────────────────────────────────

export interface ConvertResult {
  amount: Decimal;
  ok: boolean;
  /** Set when ok=false: which leg failed. */
  reason?: string;
  /** True when at least one leg used a stale/fallback rate (older than asked date). */
  stale?: boolean;
}

/**
 * Resilient currency conversion. NEVER throws AND NEVER fabricates a rate.
 *
 * INVARIANT: when `ok` is false, `amount` equals the input amount (no
 * silent 1:1 fallback, no raw-passthrough as if it were converted). Callers
 * MUST check `ok` — summing the returned amount into a display-currency
 * total when ok:false would be a "5,000,000 IDR shown as €5,000,000" bug.
 *
 * Same-currency conversions return ok:true (no FX needed). Real conversion
 * requires real cached rates for BOTH legs (or one leg equal to BASE).
 */
export async function convertSafe(args: {
  amount: Decimal | string | number;
  from: string;
  to: string;
  date: Date;
}): Promise<ConvertResult> {
  const amt = new Decimal(args.amount);
  if (args.from === args.to) return { amount: amt, ok: true };

  const day = new Date(args.date.toISOString().slice(0, 10));
  const fromInfo = args.from === BASE ? { rate: ONE, stale: false } : await rateAtLenient(args.from, day);
  const toInfo   = args.to === BASE   ? { rate: ONE, stale: false } : await rateAtLenient(args.to,   day);

  if (!fromInfo || !toInfo) {
    return {
      amount: amt,
      ok: false,
      reason: `No FX rate for ${!fromInfo ? args.from : args.to}`,
    };
  }
  const inBase = amt.div(fromInfo.rate);
  return {
    amount: inBase.mul(toInfo.rate),
    ok: true,
    stale: fromInfo.stale || toInfo.stale,
  };
}

/**
 * Legacy thrower kept for the cron path (where we want loud failure). New code
 * should use `convertSafe`.
 */
export async function convert(args: {
  amount: Decimal | string | number;
  from: string;
  to: string;
  date: Date;
}): Promise<Decimal> {
  const r = await convertSafe(args);
  if (!r.ok) throw new Error(r.reason ?? "FX missing");
  return r.amount;
}

async function rateAtLenient(quote: string, date: Date): Promise<{ rate: Decimal; stale: boolean } | null> {
  // 1. Exact-date or any prior date — the common case after the cron has run.
  const prior = await prisma.fxRate.findFirst({
    where: { quote, date: { lte: date }, base: BASE },
    orderBy: { date: "desc" },
  });
  if (prior) {
    const stale = prior.date.toISOString().slice(0, 10) !== date.toISOString().slice(0, 10);
    return { rate: new Decimal(prior.rate.toString()), stale };
  }
  // 2. On-demand fetch for the requested date.
  const fetched = await ensureFxRate(quote, date);
  if (fetched) return { rate: new Decimal(fetched.rate.toString()), stale: false };

  // 3. Last resort: any rate, even from after the requested date (better than nothing).
  const any = await prisma.fxRate.findFirst({
    where: { quote, base: BASE },
    orderBy: { date: "desc" },
  });
  if (any) return { rate: new Decimal(any.rate.toString()), stale: true };

  return null;
}
