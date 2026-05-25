/**
 * Display currencies the dashboard supports. ISO-4217 codes.
 * Used both as the picker's allowed set and as the server-side allowlist when
 * a user PATCHes their preference (never trust the client's string).
 */
export const DISPLAY_CURRENCIES = [
  { code: "USD", label: "US Dollar",        symbol: "$"  },
  { code: "EUR", label: "Euro",             symbol: "€"  },
  { code: "JPY", label: "Japanese Yen",     symbol: "¥"  },
  { code: "GBP", label: "British Pound",    symbol: "£"  },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar",  symbol: "C$" },
  { code: "CHF", label: "Swiss Franc",      symbol: "Fr" },
  { code: "CNY", label: "Chinese Yuan",     symbol: "¥"  },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]["code"];

const SET = new Set(DISPLAY_CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(s: string): s is DisplayCurrency {
  return SET.has(s as DisplayCurrency);
}
