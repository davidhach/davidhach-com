/**
 * Monthly net-worth snapshot for every user. Triggered by Vercel Cron (see vercel.json).
 * Cron requests carry `Authorization: Bearer ${CRON_SECRET}` — anything else is rejected.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { takeSnapshot } from "@/lib/net-worth";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  let ok = 0, failed = 0;
  for (const u of users) {
    try { await takeSnapshot(u.id); ok++; }
    catch (e) { failed++; console.error("snapshot failed for", u.id, e); }
  }
  return Response.json({ ok, failed, total: users.length });
}
