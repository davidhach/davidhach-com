import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { takeSnapshot } from "@/lib/net-worth";
import { recordAudit } from "@/lib/audit";
import { subMonths } from "date-fns";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const months = Math.min(120, Math.max(1, Number(url.searchParams.get("months") ?? 24)));
    const since = subMonths(new Date(), months);
    const snapshots = await prisma.snapshot.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    return ok(snapshots);
  });
}

/** POST = take a snapshot right now. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    await takeSnapshot(userId);
    await recordAudit({ userId, action: "snapshot.create", targetType: "Snapshot", req });
    const latest = await prisma.snapshot.findFirst({ where: { userId }, orderBy: { date: "desc" } });
    return ok(latest, { status: 201 });
  });
}
