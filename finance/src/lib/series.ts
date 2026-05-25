/**
 * Net-worth time series builder.
 *
 * Two strategies, picked by date span:
 *   ≤ 90 days  →  daily series computed from Valuation rows (high resolution
 *                 for short ranges).
 *   > 90 days  →  Snapshot rows (cheap, monthly granularity), converted to the
 *                 requested currency at each snapshot's own date.
 *
 * Scope filter:
 *   - "total":      every asset + liability the user owns
 *   - "entity":     only the rows for one Entity
 *   - "assetClass": only assets of one AssetClass (no liabilities)
 */
import { Decimal } from "decimal.js";
import { prisma } from "./db";
import { convert } from "./fx";

export type Range = "1D" | "7D" | "1M" | "3M" | "12M" | "custom";
export type Scope = "total" | "entity" | "assetClass";

export interface SeriesPoint {
  date: string;       // YYYY-MM-DD
  value: number;
}

export interface SeriesResult {
  series: SeriesPoint[];
  currency: string;
  from: string;
  to: string;
  scope: Scope;
  scopeId: string | null;
  resolution: "daily" | "monthly";
}

export function resolveRange(range: Range, from?: string, to?: string): { from: Date; to: Date } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const t = new Date(today);
  if (range === "custom" && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  const span: Record<Exclude<Range, "custom">, number> = { "1D": 1, "7D": 7, "1M": 30, "3M": 90, "12M": 365 };
  const days = span[range as Exclude<Range, "custom">] ?? 90;
  const f = new Date(t); f.setUTCDate(t.getUTCDate() - days);
  return { from: f, to: t };
}

interface BuildArgs {
  userId: string;
  from: Date;
  to: Date;
  currency: string;
  scope: Scope;
  scopeId: string | null;
}

export async function buildNetWorthSeries(args: BuildArgs): Promise<SeriesResult> {
  const spanDays = Math.ceil((args.to.getTime() - args.from.getTime()) / (24 * 3600 * 1000));
  return spanDays <= 90 ? buildDailyFromValuations(args) : buildFromSnapshots(args);
}

// ─── Daily series from Valuation rows ──────────────────────────────────────

async function buildDailyFromValuations(args: BuildArgs): Promise<SeriesResult> {
  const assetWhere = scopeAssetWhere(args);
  const liabilityWhere = scopeLiabilityWhere(args);

  const [assets, liabilities] = await Promise.all([
    prisma.asset.findMany({
      where: assetWhere,
      include: { valuations: { orderBy: { date: "asc" } } },
    }),
    prisma.liability.findMany({
      where: liabilityWhere,
      include: { valuations: { orderBy: { date: "asc" } } },
    }),
  ]);

  const series: SeriesPoint[] = [];
  for (const day of eachDay(args.from, args.to)) {
    let total = new Decimal(0);
    for (const a of assets) {
      const v = mostRecentAt(a.valuations, day);
      if (!v) continue;
      const conv = await convert({ amount: v.value.toString(), from: a.currency, to: args.currency, date: day });
      total = total.plus(conv);
    }
    for (const l of liabilities) {
      const v = mostRecentAt(l.valuations, day);
      if (!v) continue;
      const conv = await convert({ amount: v.value.toString(), from: l.currency, to: args.currency, date: day });
      total = total.minus(conv);
    }
    series.push({ date: day.toISOString().slice(0, 10), value: total.toNumber() });
  }

  return {
    series,
    currency: args.currency,
    from: args.from.toISOString().slice(0, 10),
    to: args.to.toISOString().slice(0, 10),
    scope: args.scope,
    scopeId: args.scopeId,
    resolution: "daily",
  };
}

// ─── Monthly series from Snapshot rows ─────────────────────────────────────

async function buildFromSnapshots(args: BuildArgs): Promise<SeriesResult> {
  const rows = await prisma.snapshot.findMany({
    where: { userId: args.userId, date: { gte: args.from, lte: args.to } },
    orderBy: { date: "asc" },
  });

  const series: SeriesPoint[] = [];
  for (const s of rows) {
    let raw: Decimal;
    if (args.scope === "total") {
      raw = new Decimal(s.netWorth.toString());
    } else if (args.scope === "entity" && args.scopeId) {
      const by = (s.byEntity as Record<string, { value: string }>) ?? {};
      raw = new Decimal(by[args.scopeId]?.value ?? "0");
    } else if (args.scope === "assetClass" && args.scopeId) {
      const by = (s.byAssetClass as Record<string, string>) ?? {};
      raw = new Decimal(by[args.scopeId] ?? "0");
    } else {
      raw = new Decimal(s.netWorth.toString());
    }
    const conv = await convert({ amount: raw, from: s.currency, to: args.currency, date: s.date });
    series.push({ date: s.date.toISOString().slice(0, 10), value: conv.toNumber() });
  }

  return {
    series,
    currency: args.currency,
    from: args.from.toISOString().slice(0, 10),
    to: args.to.toISOString().slice(0, 10),
    scope: args.scope,
    scopeId: args.scopeId,
    resolution: "monthly",
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function* eachDay(from: Date, to: Date): Generator<Date> {
  const d = new Date(from); d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to); end.setUTCHours(0, 0, 0, 0);
  while (d <= end) {
    yield new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function mostRecentAt<T extends { date: Date }>(rows: T[], at: Date): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.date <= at) best = r;
    else break;
  }
  return best;
}

function scopeAssetWhere({ userId, scope, scopeId }: BuildArgs) {
  const base = { userId, archived: false };
  if (scope === "entity" && scopeId) return { ...base, entityId: scopeId };
  if (scope === "assetClass" && scopeId) {
    // assetClass is the enum; accepted by Prisma as a string literal.
    return { ...base, assetClass: scopeId as never };
  }
  return base;
}

function scopeLiabilityWhere({ userId, scope, scopeId }: BuildArgs) {
  // Liabilities are excluded from the assetClass scope: the chart shows the
  // value of *that asset class*, not assets-minus-debts.
  if (scope === "assetClass") return { userId: "__none__" }; // empty result
  const base = { userId, archived: false };
  if (scope === "entity" && scopeId) return { ...base, entityId: scopeId };
  return base;
}
