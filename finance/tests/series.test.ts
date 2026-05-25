import { describe, it, expect } from "vitest";
import { resolveRange } from "@/lib/series";

describe("resolveRange", () => {
  it("translates named ranges into a from/to spanning the right number of days", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const cases: { range: "1D" | "7D" | "1M" | "3M" | "12M"; days: number }[] = [
      { range: "1D",  days: 1   },
      { range: "7D",  days: 7   },
      { range: "1M",  days: 30  },
      { range: "3M",  days: 90  },
      { range: "12M", days: 365 },
    ];
    for (const c of cases) {
      const { from, to } = resolveRange(c.range);
      const span = Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
      expect(span).toBe(c.days);
      expect(to.toISOString().slice(0, 10)).toBe(today.toISOString().slice(0, 10));
    }
  });

  it("honors explicit from/to in custom mode", () => {
    const r = resolveRange("custom", "2026-01-01", "2026-03-31");
    expect(r.from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(r.to.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("falls back to a 90-day window if custom is asked for without dates", () => {
    const { from, to } = resolveRange("custom");
    const span = Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
    expect(span).toBe(90);
  });
});
