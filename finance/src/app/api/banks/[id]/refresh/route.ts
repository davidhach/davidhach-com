/**
 * POST /api/banks/[id]/refresh — manually trigger a sync for one connection.
 * Lets the user pull fresh data without waiting for the daily cron.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { runSync } from "@/lib/bank";

export const POST = withAuth(async (userId, req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 2]; // .../banks/<id>/refresh
  const owns = await prisma.bankConnection.count({ where: { id, userId } });
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await runSync(id);
  return NextResponse.json(result);
});
