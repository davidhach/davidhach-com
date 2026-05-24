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
import { convert } from "./fx";

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
}

export async function liveNetWorth(userId: string, displayCurrency?: string): Promise<NetWorthBreakdown> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ccy = displayCurrency ?? user.displayCurrency;
  const today = new Date();

  const [assets, liabilities, entities] = await Promise.all([
    prisma.asset.findMany({ where: { userId, archived: false } }),
    prisma.liability.findMany({ where: { userId, archived: false } }),
    prisma.entity.findMany({ where: { userId } }),
  ]);

  const byAssetClass: Record<string, Decimal> = {};
  const byEntity: Record<string, { name: string; value: Decimal }> = Object.fromEntries(
    entities.map((e) => [e.id, { name: e.name, value: new Decimal(0) }]),
  );

  let totalAssets = new Decimal(0);
  for (const a of assets) {
    const native = new Decimal(a.currentValue.toString());
    const converted = await convert({ amount: native, from: a.currency, to: ccy, date: today });
    totalAssets = totalAssets.plus(converted);
    byAssetClass[a.assetClass] = (byAssetClass[a.assetClass] ?? new Decimal(0)).plus(converted);
    if (byEntity[a.entityId]) byEntity[a.entityId].value = byEntity[a.entityId].value.plus(converted);
  }

  let totalLiabilities = new Decimal(0);
  for (const l of liabilities) {
    const native = new Decimal(l.currentValue.toString());
    const converted = await convert({ amount: native, from: l.currency, to: ccy, date: today });
    totalLiabilities = totalLiabilities.plus(converted);
    if (byEntity[l.entityId]) byEntity[l.entityId].value = byEntity[l.entityId].value.minus(converted);
  }

  return {
    asOf: today,
    currency: ccy,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.minus(totalLiabilities),
    byAssetClass,
    byEntity,
    assetCount: assets.length,
    liabilityCount: liabilities.length,
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
