import { NextRequest } from "next/server";
import { refreshFxRates } from "@/lib/fx";
import { prisma } from "@/lib/db";
import { takeSnapshot } from "@/lib/net-worth";

/**
 * Daily FX refresh. The Hobby plan allows only 2 cron jobs, so the monthly
 * net-worth snapshot piggybacks on this daily job: it runs for every user when
 * it's the 1st of the month (UTC). The standalone /api/cron/snapshot route is
 * kept for manual triggering and for re-promotion to its own schedule on Pro.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rates = await refreshFxRates();

  let snapshot: { ok: number; failed: number; total: number } | null = null;
  if (new Date().getUTCDate() === 1) {
    const users = await prisma.user.findMany({ select: { id: true } });
    let ok = 0, failed = 0;
    for (const u of users) {
      try { await takeSnapshot(u.id); ok++; }
      catch (e) { failed++; console.error("snapshot failed for", u.id, e); }
    }
    snapshot = { ok, failed, total: users.length };
  }

  return Response.json({ rates, snapshot });
}
