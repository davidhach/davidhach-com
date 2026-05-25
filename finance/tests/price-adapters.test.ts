import { describe, it, expect } from "vitest";
import { parseStooqCsv } from "@/lib/price-adapters/stooq";
import { getAdapter, ADAPTER_IDS, MANUAL_SOURCE } from "@/lib/price-adapters";

describe("Stooq CSV parser", () => {
  it("extracts the close price and infers currency from the exchange suffix", () => {
    const csv = `Symbol,Date,Time,Open,High,Low,Close,Volume
AAPL.US,2026-05-22,22:00:01,180.10,181.50,179.80,180.95,52000000`;
    const q = parseStooqCsv(csv, "AAPL.US");
    expect(q).not.toBeNull();
    expect(q!.price.toString()).toBe("180.95");
    expect(q!.currency).toBe("USD");
    expect(q!.date.toISOString().slice(0, 10)).toBe("2026-05-22");
  });

  it("maps German tickers to EUR", () => {
    const csv = `Symbol,Date,Time,Open,High,Low,Close,Volume
SAP.DE,2026-05-22,17:35:00,165.20,166.50,164.90,166.10,1200000`;
    const q = parseStooqCsv(csv, "SAP.DE");
    expect(q?.currency).toBe("EUR");
    expect(q?.price.toString()).toBe("166.10");
  });

  it("returns null when Stooq has no data (N/D)", () => {
    const csv = `Symbol,Date,Time,Open,High,Low,Close,Volume
XXXX.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D`;
    expect(parseStooqCsv(csv, "XXXX.US")).toBeNull();
  });

  it("returns null for a malformed/empty response", () => {
    expect(parseStooqCsv("", "AAPL.US")).toBeNull();
    expect(parseStooqCsv("garbage", "AAPL.US")).toBeNull();
  });
});

describe("adapter registry", () => {
  it("exposes stooq, coingecko, metals", () => {
    expect(ADAPTER_IDS.sort()).toEqual(["coingecko", "metals", "stooq"]);
  });
  it("getAdapter returns null for unknown ids", () => {
    expect(getAdapter("plaid")).toBeNull();
    expect(getAdapter(MANUAL_SOURCE)).toBeNull(); // manual is a sentinel, not an adapter
  });
});
