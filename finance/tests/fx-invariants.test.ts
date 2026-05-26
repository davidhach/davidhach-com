/**
 * Regression: FX behaviour the hard way.
 *
 * The bug we shipped before:
 *   - exchangerate.host quietly added a paywall → refreshFxRates returned nothing
 *     → DB had no rates → convertSafe returned ok:false with raw passthrough
 *     → the SPENDING page never called convertSafe, so 5,000,000 IDR was summed
 *       into the EUR total as €5,000,000.
 *
 * These tests assert source-of-truth invariants by reading the actual code,
 * which catches a future refactor that silently re-introduces the bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("FX invariants", () => {
  it("fx.ts no longer references the dead exchangerate.host provider", () => {
    const src = read("src/lib/fx.ts");
    expect(src).not.toMatch(/exchangerate\.host/);
  });

  it("fx.ts uses open.er-api as primary and frankfurter as fallback", () => {
    const src = read("src/lib/fx.ts");
    expect(src).toMatch(/open\.er-api\.com/);
    expect(src).toMatch(/api\.frankfurter\.app/);
  });

  it("convertSafe returns ok:false with the input amount on missing rate (never fabricates)", () => {
    // The exact failure-branch shape — if a refactor removes the explicit
    // `amount: amt` here, the function might start returning a converted-but-
    // bogus value, and we'd be back to the 1:1 fallback bug.
    const src = read("src/lib/fx.ts");
    expect(src).toMatch(/if \(!fromInfo \|\| !toInfo\)[\s\S]*?amount: amt[\s\S]*?ok: false/);
    expect(src).toMatch(/NEVER fabricates a rate/);
  });

  it("spending page calls convertSafe and skips !ok rows", () => {
    // The original bug: spending page summed raw t.amount regardless of
    // currency. Every consumer that aggregates money MUST call convertSafe
    // and explicitly skip rows where ok is false.
    const src = read("src/app/(app)/spending/page.tsx");
    expect(src).toMatch(/convertSafe/);
    expect(src).toMatch(/if \(!conv\.ok\)/);
    // And surface a banner to the user — silent exclusion is worse than the bug.
    expect(src).toMatch(/FX rate unavailable/);
  });

  it("dashboard spending widget also calls convertSafe", () => {
    // Same hazard: the dashboard rolls up this-month spending/income.
    const src = read("src/app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/convertSafe/);
    expect(src).toMatch(/if \(!res\.ok\)/);
  });

  it("net-worth aggregation skips !ok currencies and records them", () => {
    const src = read("src/lib/net-worth.ts");
    expect(src).toMatch(/if \(!r\.ok\)[\s\S]*?fxFailedCurrencies/);
    expect(src).toMatch(/fxWarnings/);
  });

  it("/api/refresh exists and is auth-gated, scoped to the caller", () => {
    const src = read("src/app/api/refresh/route.ts");
    expect(src).toMatch(/withAuth/);
    // The bank-sync filter MUST include userId so a user can't trigger another
    // user's connections.
    expect(src).toMatch(/userId,\s*status: "ACTIVE"/);
    // Must NOT use the cron-secret path.
    expect(src).not.toMatch(/CRON_SECRET/);
  });
});
