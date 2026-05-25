/**
 * POST /api/assets/[id]/resolve
 *
 * Looks up the asset's `symbol` (expected to be an ISIN) via OpenFIGI, sets
 * priceSource = "stooq" + externalRef = <best listing>, then runs a live
 * refresh so currentValue reflects market immediately.
 *
 * Used after the Add-asset form saves without resolving (because resolution
 * timed out or the user submitted before pressing Resolve). The /assets row
 * also exposes a "Resolve" button that calls this.
 *
 * Idempotent: if a price source is already set, returns ok without re-doing work.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { resolveIsin } from "@/lib/isin-resolver";
import { refreshAssetPrice } from "@/lib/price-refresh";

function lastSeg(pathname: string, offset = 0): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1 - offset];
}

export const POST = withAuth(async (userId, req) => {
  const id = lastSeg(new URL(req.url).pathname, 1); // .../assets/<id>/resolve
  const asset = await prisma.asset.findFirst({
    where: { id, userId },
    select: { id: true, symbol: true, currency: true, priceSource: true, externalRef: true },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already resolved → just refresh and return.
  if (asset.priceSource && asset.priceSource !== "manual" && asset.externalRef) {
    const r = await refreshAssetPrice(asset.id);
    return NextResponse.json({ alreadyResolved: true, refresh: r });
  }

  const isinCandidate = (asset.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isinCandidate)) {
    return NextResponse.json(
      { error: "No ISIN to resolve. Edit the asset and add an ISIN or enter a ticker manually." },
      { status: 400 },
    );
  }

  const hit = await resolveIsin(isinCandidate, { preferredCurrency: asset.currency });
  if (!hit) {
    return NextResponse.json(
      { error: "No listing returned a live quote. Try a different ISIN or enter the Stooq ticker manually." },
      { status: 404 },
    );
  }

  await prisma.asset.update({
    where: { id: asset.id },
    data: { priceSource: "stooq", externalRef: hit.stooqRef, name: hit.name },
  });
  const refresh = await refreshAssetPrice(asset.id);
  return NextResponse.json({ resolved: { ticker: hit.ticker, stooqRef: hit.stooqRef, name: hit.name }, refresh });
});
