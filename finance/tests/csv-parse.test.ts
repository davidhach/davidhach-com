import { describe, it, expect } from "vitest";
import { parseBankCsv } from "@/lib/bank/csv/parse";

describe("parseBankCsv", () => {
  it("parses a simple comma CSV with header on row 1", () => {
    const csv = `Date,Description,Amount,Currency
2026-05-01,Apple Store,-129.00,USD
2026-05-02,Salary,4500.00,USD`;
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.delimiter).toBe(",");
    expect(r.rows[0]).toMatchObject({ date: "2026-05-01", amount: "-129.00", currency: "USD", description: "Apple Store" });
    expect(r.rows[1].amount).toBe("4500.00");
  });

  it("handles German Sparkasse-style: semicolons, DD.MM.YYYY, comma-decimals", () => {
    const csv = `Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Empfaenger;Betrag;Waehrung
DE12;01.05.2026;01.05.2026;LASTSCHRIFT;Edeka Markt;Edeka Berlin;-42,17;EUR
DE12;02.05.2026;02.05.2026;GUTSCHRIFT;Gehalt April;Acme AG;4500,00;EUR`;
    const r = parseBankCsv(csv);
    expect(r.delimiter).toBe(";");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-05-01", amount: "-42.17", currency: "EUR", merchant: "Edeka Berlin" });
    expect(r.rows[1].amount).toBe("4500.00");
  });

  it("handles split debit/credit columns", () => {
    const csv = `Date,Description,Debit,Credit
2026-05-01,Coffee,4.50,
2026-05-02,Refund,,12.00`;
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].amount).toBe("-4.50");
    expect(r.rows[1].amount).toBe("12.00");
  });

  it("ignores leading metadata rows and finds the real header", () => {
    const csv = `Statement period 01.05.2026 - 31.05.2026
Account: DE12...
;;;
Buchungstag;Verwendungszweck;Betrag;Waehrung
05.05.2026;Spotify;-9,99;EUR`;
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ date: "2026-05-05", amount: "-9.99", currency: "EUR" });
  });

  it("returns warnings for unparseable rows but keeps the good ones", () => {
    const csv = `Date,Description,Amount
not-a-date,Bad,1.00
2026-05-01,Good,5.00`;
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("not-a-date"))).toBe(true);
  });

  it("respects the default currency when no currency column is present", () => {
    const csv = `Date,Description,Amount
2026-05-01,Test,1.00`;
    const r = parseBankCsv(csv, "GBP");
    expect(r.rows[0].currency).toBe("GBP");
  });
});
