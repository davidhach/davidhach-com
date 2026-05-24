import { requireUserId } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { liveNetWorth } from "@/lib/net-worth";
import { prisma } from "@/lib/db";
import { subMonths } from "date-fns";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const [breakdown, snapshots, recentTxs] = await Promise.all([
      liveNetWorth(userId),
      prisma.snapshot.findMany({
        where: { userId, date: { gte: subMonths(new Date(), 24) } },
        orderBy: { date: "asc" },
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 8,
        include: { category: true, finAccount: true },
      }),
    ]);
    return ok({
      breakdown: {
        ...breakdown,
        totalAssets: breakdown.totalAssets.toString(),
        totalLiabilities: breakdown.totalLiabilities.toString(),
        netWorth: breakdown.netWorth.toString(),
        byAssetClass: Object.fromEntries(Object.entries(breakdown.byAssetClass).map(([k, v]) => [k, v.toString()])),
        byEntity: Object.fromEntries(Object.entries(breakdown.byEntity).map(([k, v]) => [k, { name: v.name, value: v.value.toString() }])),
      },
      snapshots,
      recentTransactions: recentTxs,
    });
  });
}
