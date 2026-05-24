import { describe, it, expect } from "vitest";
import { formatMoney, formatPercent, pctChange } from "@/lib/utils";
import { normalizeMerchant } from "@/lib/ocr";

describe("formatting", () => {
  it("formats money in the requested currency", () => {
    expect(formatMoney("1234.5", "USD")).toMatch(/\$1,234\.50/);
  });
  it("formats percent with sign", () => {
    expect(formatPercent(0.0312)).toBe("+3.1%");
    expect(formatPercent(-0.0312)).toBe("-3.1%");
  });
  it("pctChange handles zero baseline", () => {
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(0, 10)).toBe(Infinity);
    expect(pctChange(100, 110)).toBeCloseTo(0.1);
  });
});

describe("merchant normalization", () => {
  it("strips noise so duplicates match", () => {
    expect(normalizeMerchant("STARBUCKS #1234 NEW YORK NY")).toBe("starbucks 1234 new york ny");
    expect(normalizeMerchant("  Whole-Foods  ")).toBe("whole foods");
    expect(normalizeMerchant(null)).toBeNull();
  });
});
