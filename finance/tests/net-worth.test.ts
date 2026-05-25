import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { aggregateNetWorth } from "@/lib/net-worth";

// Pretend the user has two entities (Personal + Holding) with mixed assets and a debt.
// Currencies are pre-converted by our fake `convert` so we can assert the math.
const ENT_P = "ent-personal";
const ENT_H = "ent-holding";

const ASSETS = [
  { entityId: ENT_P, assetClass: "CASH",   currency: "USD", currentValue: "10000" },
  { entityId: ENT_P, assetClass: "STOCKS", currency: "USD", currentValue: "25000" },
  { entityId: ENT_H, assetClass: "STOCKS", currency: "USD", currentValue: "75000" },
];
const LIABILITIES = [
  { entityId: ENT_P, currency: "USD", currentValue: "5000" },
  { entityId: ENT_H, currency: "USD", currentValue: "20000" },
];
const ENTITIES = [
  { id: ENT_P, name: "Personal" },
  { id: ENT_H, name: "Holding GmbH" },
];
// 1:1 identity converter — we already feed USD throughout.
const identity = async (a: Decimal) => a;

describe("aggregateNetWorth — entity filter", () => {
  it("totals across all entities when not scoped", async () => {
    const r = await aggregateNetWorth({
      assets: ASSETS, liabilities: LIABILITIES, entities: ENTITIES,
      displayCurrency: "USD", asOf: new Date(), convert: identity,
    });
    expect(r.totalAssets.toString()).toBe("110000");
    expect(r.totalLiabilities.toString()).toBe("25000");
    expect(r.netWorth.toString()).toBe("85000");
    expect(r.byEntity[ENT_P].value.toString()).toBe("30000"); // 35k assets - 5k liab
    expect(r.byEntity[ENT_H].value.toString()).toBe("55000"); // 75k assets - 20k liab
  });

  it("restricts to the selected entity (Personal only)", async () => {
    const personalAssets = ASSETS.filter((a) => a.entityId === ENT_P);
    const personalLiabs  = LIABILITIES.filter((l) => l.entityId === ENT_P);
    const r = await aggregateNetWorth({
      assets: personalAssets, liabilities: personalLiabs,
      entities: ENTITIES.filter((e) => e.id === ENT_P),
      displayCurrency: "USD", asOf: new Date(), convert: identity,
    });
    expect(r.totalAssets.toString()).toBe("35000");
    expect(r.totalLiabilities.toString()).toBe("5000");
    expect(r.netWorth.toString()).toBe("30000");
    // Other entity should not appear in the breakdown when scoped.
    expect(r.byEntity[ENT_H]).toBeUndefined();
  });

  it("restricts to the Holding entity", async () => {
    const r = await aggregateNetWorth({
      assets: ASSETS.filter((a) => a.entityId === ENT_H),
      liabilities: LIABILITIES.filter((l) => l.entityId === ENT_H),
      entities: ENTITIES.filter((e) => e.id === ENT_H),
      displayCurrency: "USD", asOf: new Date(), convert: identity,
    });
    expect(r.netWorth.toString()).toBe("55000");
    expect(r.byAssetClass.STOCKS?.toString()).toBe("75000");
    expect(r.byAssetClass.CASH).toBeUndefined();
  });
});
