/**
 * POST /api/assets/[id]/refresh
 * Pulls a live price for one asset. The Refresh button on the asset row /
 * detail page calls this.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { refreshAssetPrice } from "@/lib/price-refresh";

export const POST = withAuth(async (userId, req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  const owns = await prisma.asset.count({ where: { id, userId } });
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await refreshAssetPrice(id);
  return NextResponse.json(result);
});
