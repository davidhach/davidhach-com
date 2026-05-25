/**
 * FX cache + safe conversion.
 *
 * Hard rule: `convertSafe` MUST NEVER throw. The dashboard, the series builder,
 * and the spending page all call into FX; one missing rate cannot 500 the whole
 * page. Missing-rate fallback order:
 *   1. Use the most recent cached rate for that quote, regardless of date.
 *   2. On-demand single-pair fetch (`ensureFxRate`) for a closer date.
 *   3. Fall through: return the original amount + ok:false + reason.
 *
 * `convert` is kept as a thin wrapper that throws — only the cron uses it,
 * and only because that's the cron's idiomatic style. New callers should use
 * `convertSafe`.
 */
import { prisma } from "./db";
import { Decimal } from "decimal.js";

const BASE = process.env.FX_BASE ?? "USD";
const ONE = new Decimal(1);

interface RatesPayload {
  base: string;
  date: string; // YYYY-MM-DD
  rates: Record<string, number>;
}

// ─── Cache refresh ─────────────────────────────────────────────────────────

/** Daily cron refresh — full set of rates from exchangerate.host. */
export async function refreshFxRates(forDate?: Date): Promise<number> {
  const date = forDate ?? new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const url = `https://api.exchangerate.host/${dateStr}?base=${encodeURIComponent(BASE)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const payload = (await res.json()) as RatesPayload;
  const entries = Object.entries(payload.rates ?? {});
  await prisma.$transaction(
    entries.map(([quote, rate]) =>
      prisma.fxRate.upsert({
        where: { date_base_quote: { date: new Date(dateStr), base: BASE, quote } },
        create: { date: new Date(dateStr), base: BASE, quote, rate: new Decimal(rate), source: "exchangerate.host" },
        update: { rate: new Decimal(rate), source: "exchangerate.host" },
      }),
    ),
  );

  // Best-effort: also make sure every currency a user actually holds has at
  // least one rate row. If exchangerate.host's response is missing one (rare
  // but possible for thinly-traded codes), try a single-pair fetch for it.
  const used = await usedCurrencies();
  const wanted = used.filter((c) => c !== BASE && !payload.rates?.[c]);
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
  // If we already have something for that day, no-op.
  const existing = await prisma.fxRate.findUnique({
    where: { date_base_quote: { date: new Date(dateStr), base: BASE, quote } },
  });
  if (existing) return existing;

  try {
    const url = `https://api.exchangerate.host/${dateStr}?base=${encodeURIComponent(BASE)}&symbols=${encodeURIComponent(quote)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const payload = (await res.json()) as RatesPayload;
    const rate = payload.rates?.[quote];
    if (rate == null || !Number.isFinite(rate)) return null;
    return prisma.fxRate.upsert({
      where: { date_base_quote: { date: new Date(dateStr), base: BASE, quote } },
      create: { date: new Date(dateStr), base: BASE, quote, rate: new Decimal(rate), source: "exchangerate.host" },
      update: { rate: new Decimal(rate), source: "exchangerate.host" },
    });
  } catch {
    return null;
  }
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
 * Resilient currency conversion. NEVER throws.
 *
 * If a rate is unavailable we return `{ ok: false, amount: <input>, reason }`
 * so the caller can render a "FX unavailable" indicator instead of crashing.
 * Same-currency conversions are free and always ok.
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
