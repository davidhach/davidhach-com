import { NextRequest } from "next/server";
import { refreshFxRates } from "@/lib/fx";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n = await refreshFxRates();
  return Response.json({ rates: n });
}
