import { describe, it, expect } from "vitest";
import { DISPLAY_CURRENCIES, isSupportedCurrency } from "@/lib/currencies";

describe("display currency allowlist", () => {
  it("covers exactly the 10 currencies from the brief", () => {
    const codes = DISPLAY_CURRENCIES.map((c) => c.code).sort();
    expect(codes).toEqual(
      ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"],
    );
  });

  it("isSupportedCurrency accepts allowed codes only", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("usd")).toBe(false); // caller must upper-case
  });
});
