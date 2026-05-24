import { describe, it, expect } from "vitest";
import { ocrResponse, extractedTransaction } from "@/lib/validation";

describe("OCR schema validation", () => {
  it("accepts a well-formed Claude response", () => {
    const parsed = ocrResponse.parse({
      accountHint: "•••• 4218",
      statementPeriod: { start: "2026-05-01", end: "2026-05-31" },
      detectedCurrency: "USD",
      transactions: [
        { date: "2026-05-03", description: "STARBUCKS #1234", merchant: "Starbucks", amount: "-5.75", currency: "USD", categoryGuess: "Coffee", confidence: 0.95 },
        { date: "2026-05-15", description: "PAYROLL", merchant: null, amount: "4200.00", currency: "USD", categoryGuess: "Income", confidence: 0.99 },
      ],
      warnings: [],
      overallConfidence: 0.97,
    });
    expect(parsed.transactions).toHaveLength(2);
  });

  it("rejects malformed dates", () => {
    expect(() => extractedTransaction.parse({ date: "May 3, 2026", description: "x", amount: "-1.00", currency: "USD" })).toThrow();
  });

  it("rejects un-stringified amounts (float drift defense)", () => {
    expect(() => extractedTransaction.parse({ date: "2026-05-03", description: "x", amount: -1, currency: "USD" })).toThrow();
  });
});
