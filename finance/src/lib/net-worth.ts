/**
 * Net worth aggregation.
 *
 * Two flavours:
 *   - liveNetWorth(userId): walks the current Asset/Liability rows, converts to
 *     the user's display currency, and returns the dashboard payload. Cheap;
 *     run on every dashboard request.
 *   - takeSnapshot(userId, date): persists today's aggregate as a Snapshot row
 *     so the time series doesn't have to recompute history. Run monthly by cron
 *     and manually on demand.
 */
import { Decimal } from "decimal.js";
import { prisma } from "./db";
import { convertSafe } from "./fx";

export interface NetWorthBreakdown {
  asOf: Date;
  currency: string;
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  netWorth: Decimal;
  byAssetClass: Record<string, Decimal>;
  byEntity: Record<string, { name: string; value: Decimal }>;
  assetCount: number;
  liabilityCount: number;
  /** Currencies we couldn't convert today — shown as a dashboard banner. */
  fxWarnings: string[];
}

export interface LiveOptions {
  displayCurrency?: string;
  entityId?: string;     // when set, restrict to assets/liabilities for this entity
}

export async function liveNetWorth(userId: string, optsOrCcy?: LiveOptions | string): Promise<NetWorthBreakdown> {
  const opts: LiveOptions =
    typeof optsOrCcy === "string" ? { displayCurrency: optsOrCcy } : optsOrCcy ?? {};
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ccy = opts.displayCurrency ?? user.displayCurrency;
  const entityFilter = opts.entityId ? { entityId: opts.entityId } : {};
  const today = new Date();

  const [assets, liabilities, entities] = await Promise.all([
    prisma.asset.findMany({ where: { userId, archived: false, ...entityFilter } }),
    prisma.liability.findMany({ where: { userId, archived: false, ...entityFilter } }),
    prisma.entity.findMany({
      where: { userId, ...(opts.entityId ? { id: opts.entityId } : {}) },
    }),
  ]);

  return aggregateNetWorth({
    assets, liabilities, entities,
    displayCurrency: ccy,
    asOf: today,
    convert: async (a, from) => {
      const r = await convertSafe({ amount: a, from, to: ccy, date: today });
      return { amount: r.amount, ok: r.ok, reason: r.reason };
    },
  });
}

/**
 * Pure aggregation step. Pulled out of liveNetWorth so it's unit-testable
 * without a database — feed it plain objects + a fake `convert`.
 *
 * The `convert` callback can return ok:false; the aggregate then drops that
 * row from the converted totals and records the currency in `fxWarnings`. The
 * dashboard renders a banner so the user sees what was excluded.
 */
export async function aggregateNetWorth(input: {
  assets: Array<{ entityId: string; assetClass: string; currency: string; currentValue: { toString(): string } }>;
  liabilities: Array<{ entityId: string; currency: string; currentValue: { toString(): string } }>;
  entities: Array<{ id: string; name: string }>;
  displayCurrency: string;
  asOf: Date;
  convert: (amount: Decimal, from: string) => Promise<{ amount: Decimal; ok: boolean; reason?: string }> | Promise<Decimal>;
}): Promise<NetWorthBreakdown> {
  const { assets, liabilities, entities, displayCurrency, asOf } = input;
  const byAssetClass: Record<string, Decimal> = {};
  const byEntity: Record<string, { name: string; value: Decimal }> = Object.fromEntries(
    entities.map((e) => [e.id, { name: e.name, value: new Decimal(0) }]),
  );
  const fxFailedCurrencies = new Set<string>();

  // Adapter for both shapes: pure Decimal (legacy callers + tests) and {amount, ok}.
  const adapt = async (amt: Decimal, from: string) => {
    const r = await input.convert(amt, from);
    return Decimal.isDecimal(r) ? { amount: r as Decimal, ok: true } : (r as { amount: Decimal; ok: boolean });
  };

  let totalAssets = new Decimal(0);
  for (const a of assets) {
    const r = await adapt(new Decimal(a.currentValue.toString()), a.currency);
    if (!r.ok) { fxFailedCurrencies.add(a.currency); continue; }
    totalAssets = totalAssets.plus(r.amount);
    byAssetClass[a.assetClass] = (byAssetClass[a.assetClass] ?? new Decimal(0)).plus(r.amount);
    if (byEntity[a.entityId]) byEntity[a.entityId].value = byEntity[a.entityId].value.plus(r.amount);
  }

  let totalLiabilities = new Decimal(0);
  for (const l of liabilities) {
    const r = await adapt(new Decimal(l.currentValue.toString()), l.currency);
    if (!r.ok) { fxFailedCurrencies.add(l.currency); continue; }
    totalLiabilities = totalLiabilities.plus(r.amount);
    if (byEntity[l.entityId]) byEntity[l.entityId].value = byEntity[l.entityId].value.minus(r.amount);
  }

  return {
    asOf,
    currency: displayCurrency,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.minus(totalLiabilities),
    byAssetClass,
    byEntity,
    assetCount: assets.length,
    liabilityCount: liabilities.length,
    fxWarnings: [...fxFailedCurrencies],
  };
}

export async function takeSnapshot(userId: string, date?: Date): Promise<void> {
  const nw = await liveNetWorth(userId);
  const snapshotDate = date ?? new Date();
  const dateOnly = new Date(snapshotDate.toISOString().slice(0, 10));

  await prisma.snapshot.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    create: {
      userId,
      date: dateOnly,
      currency: nw.currency,
      totalAssets: nw.totalAssets.toFixed(2),
      totalLiabilities: nw.totalLiabilities.toFixed(2),
      netWorth: nw.netWorth.toFixed(2),
      byAssetClass: Object.fromEntries(Object.entries(nw.byAssetClass).map(([k, v]) => [k, v.toFixed(2)])),
      byEntity: Object.fromEntries(Object.entries(nw.byEntity).map(([k, v]) => [k, { name: v.name, value: v.value.toFixed(2) }])),
    },
    update: {
      currency: nw.currency,
      totalAssets: nw.totalAssets.toFixed(2),
      totalLiabilities: nw.totalLiabilities.toFixed(2),
      netWorth: nw.netWorth.toFixed(2),
      byAssetClass: Object.fromEntries(Object.entries(nw.byAssetClass).map(([k, v]) => [k, v.toFixed(2)])),
      byEntity: Object.fromEntries(Object.entries(nw.byEntity).map(([k, v]) => [k, { name: v.name, value: v.value.toFixed(2) }])),
    },
  });
}
