/**
 * Regression: managed crypto assets are WALLET-BALANCE-AUTHORITATIVE.
 *
 * The bug we shipped before:
 *   - upsertManagedAsset wrote quantity = wallet balance (good).
 *   - But every re-sync also wrote currentValue:"0" + currency:"BTC", then
 *     called refreshAssetPrice(); if that price fetch failed, the asset
 *     stayed at $0 until the next successful refresh.
 *   - And /api/trades/confirm would happily recompute Asset.quantity from
 *     the AssetTransaction ledger on a managed asset, zeroing the wallet
 *     reading until the next sync.
 *
 * These tests don't hit the DB — they assert source-of-truth invariants by
 * reading the actual code, which is the cheapest way to catch a future
 * refactor that silently re-introduces the bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarisePosition } from "@/lib/asset-positions";
import { Decimal } from "decimal.js";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("managed-asset invariants", () => {
  it("refreshAssetPrice never writes Asset.quantity", () => {
    // The prisma.asset.update() inside refreshAssetPrice MUST NOT include a
    // `quantity:` key — quantity is owned by upsertManagedAsset (for managed)
    // or AssetTransaction position math (for manual quantity-based assets).
    const src = read("src/lib/price-refresh.ts");
    // Find the asset update block and assert no `quantity:` field inside it.
    const m = src.match(/prisma\.asset\.update\(\{[\s\S]*?\}\)/);
    expect(m, "asset.update block not found").toBeTruthy();
    expect(m![0]).not.toMatch(/\bquantity:/);
  });

  it("refreshAssetPrice converts managed-asset value to display currency", () => {
    // Otherwise CoinGecko's USD would show as raw "$" on the assets page.
    const src = read("src/lib/price-refresh.ts");
    expect(src).toMatch(/managedByLinkId/);
    expect(src).toMatch(/convertSafe/);
    expect(src).toMatch(/displayCurrency/);
  });

  it("upsertManagedAsset preserves priced currentValue on re-sync (no flash-to-zero)", () => {
    // For an EXISTING managed crypto row, the re-sync must not overwrite
    // currentValue back to the "0" placeholder — only quantity is wallet-
    // authoritative; currentValue + currency belong to refreshAssetPrice.
    const src = read("src/lib/bank/index.ts");
    // The existing-branch update must explicitly NOT spread the full `data`
    // (which contains currentValue:"0") when priceSource is set.
    expect(src).toMatch(/priceSource\s*\?\s*\{[\s\S]*?quantity: data\.quantity/);
    expect(src).toMatch(/CASH: currentValue IS the authoritative bank balance/);
  });

  it("/api/trades/confirm refuses managed assets", () => {
    // Without this guard, summarisePosition would overwrite the wallet
    // quantity from the AssetTransaction ledger.
    const src = read("src/app/api/trades/confirm/route.ts");
    expect(src).toMatch(/asset\.managedByLinkId/);
    expect(src).toMatch(/409/);
  });

  it("/api/assets/[id]/transactions refuses managed assets (already enforced)", () => {
    const src = read("src/app/api/assets/[id]/transactions/route.ts");
    expect(src).toMatch(/asset\.managedByLinkId/);
    expect(src).toMatch(/409/);
  });

  it("summarisePosition on an empty ledger returns quantity 0 (why the guard matters)", () => {
    // This is the math that would zero a managed asset if the guard were
    // missing — the wallet has 0.5 BTC, but the AssetTransaction ledger is
    // empty, so position math returns 0.
    const s = summarisePosition([]);
    expect(s.quantity.eq(new Decimal(0))).toBe(true);
  });
});
