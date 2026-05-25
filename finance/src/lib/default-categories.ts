/**
 * Default categories + merchant→category rules shipped as a starting point.
 *
 * Keep this list conservative and globally relevant. Users add their own via
 * inline re-categorisation on /spending (which auto-creates a CategoryRule).
 *
 * Patterns are lowercase substrings matched against `Transaction.description`
 * (DESCRIPTION_CONTAINS) — captures both the cleaned merchant name and any
 * structured remittance text.
 */
export interface DefaultCategory { name: string; kind: "EXPENSE" | "INCOME" }
export interface DefaultRule { pattern: string; category: string }

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Spending
  { name: "Groceries",      kind: "EXPENSE" },
  { name: "Dining",         kind: "EXPENSE" },
  { name: "Transport",      kind: "EXPENSE" },
  { name: "Fuel",           kind: "EXPENSE" },
  { name: "Subscriptions",  kind: "EXPENSE" },
  { name: "Utilities",      kind: "EXPENSE" },
  { name: "Rent / Housing", kind: "EXPENSE" },
  { name: "Insurance",      kind: "EXPENSE" },
  { name: "Healthcare",     kind: "EXPENSE" },
  { name: "Entertainment",  kind: "EXPENSE" },
  { name: "Shopping",       kind: "EXPENSE" },
  { name: "Travel",         kind: "EXPENSE" },
  { name: "Bank fees",      kind: "EXPENSE" },
  { name: "Taxes",          kind: "EXPENSE" },
  // Income
  { name: "Salary",            kind: "INCOME" },
  { name: "Refund",            kind: "INCOME" },
  { name: "Interest",          kind: "INCOME" },
  { name: "Investment income", kind: "INCOME" },
  { name: "Other income",      kind: "INCOME" },
];

export const DEFAULT_RULES: DefaultRule[] = [
  // Groceries — DE + general
  { pattern: "rewe",        category: "Groceries" },
  { pattern: "edeka",       category: "Groceries" },
  { pattern: "aldi",        category: "Groceries" },
  { pattern: "lidl",        category: "Groceries" },
  { pattern: "kaufland",    category: "Groceries" },
  { pattern: "penny",       category: "Groceries" },
  { pattern: "netto",       category: "Groceries" },
  { pattern: "rossmann",    category: "Groceries" },
  { pattern: "dm-drogerie", category: "Groceries" },
  { pattern: "tesco",       category: "Groceries" },
  { pattern: "sainsbury",   category: "Groceries" },
  { pattern: "whole foods", category: "Groceries" },
  { pattern: "trader joe",  category: "Groceries" },

  // Dining
  { pattern: "starbucks",   category: "Dining" },
  { pattern: "mcdonald",    category: "Dining" },
  { pattern: "burger king", category: "Dining" },
  { pattern: "kfc",         category: "Dining" },
  { pattern: "subway",      category: "Dining" },
  { pattern: "lieferando",  category: "Dining" },
  { pattern: "wolt",        category: "Dining" },
  { pattern: "uber eats",   category: "Dining" },
  { pattern: "deliveroo",   category: "Dining" },
  { pattern: "doordash",    category: "Dining" },

  // Transport
  { pattern: "uber",        category: "Transport" },
  { pattern: "bolt",        category: "Transport" },
  { pattern: "lyft",        category: "Transport" },
  { pattern: "free now",    category: "Transport" },
  { pattern: "bvg",         category: "Transport" },
  { pattern: "deutsche bahn", category: "Transport" },
  { pattern: "db vertrieb", category: "Transport" },
  { pattern: "tfl",         category: "Transport" },
  { pattern: "mvg",         category: "Transport" },
  { pattern: "9-euro",      category: "Transport" },

  // Fuel
  { pattern: "aral",        category: "Fuel" },
  { pattern: "shell",       category: "Fuel" },
  { pattern: "esso",        category: "Fuel" },
  { pattern: "total",       category: "Fuel" },
  { pattern: "jet ",        category: "Fuel" },

  // Subscriptions
  { pattern: "netflix",     category: "Subscriptions" },
  { pattern: "spotify",     category: "Subscriptions" },
  { pattern: "apple.com/bill", category: "Subscriptions" },
  { pattern: "icloud",      category: "Subscriptions" },
  { pattern: "google ",     category: "Subscriptions" },
  { pattern: "github",      category: "Subscriptions" },
  { pattern: "openai",      category: "Subscriptions" },
  { pattern: "anthropic",   category: "Subscriptions" },
  { pattern: "disney",      category: "Subscriptions" },
  { pattern: "youtube",     category: "Subscriptions" },
  { pattern: "amazon prime", category: "Subscriptions" },
  { pattern: "linkedin",    category: "Subscriptions" },
  { pattern: "patreon",     category: "Subscriptions" },

  // Utilities
  { pattern: "vodafone",    category: "Utilities" },
  { pattern: "telekom",     category: "Utilities" },
  { pattern: "o2",          category: "Utilities" },
  { pattern: "1und1",       category: "Utilities" },
  { pattern: "1&1",         category: "Utilities" },
  { pattern: "stadtwerke",  category: "Utilities" },
  { pattern: "vattenfall",  category: "Utilities" },
  { pattern: "eon",         category: "Utilities" },
  { pattern: "e.on",        category: "Utilities" },

  // Insurance
  { pattern: "allianz",     category: "Insurance" },
  { pattern: "axa",         category: "Insurance" },
  { pattern: "huk",         category: "Insurance" },
  { pattern: "tk gesund",   category: "Insurance" },
  { pattern: "barmer",      category: "Insurance" },
  { pattern: "techniker",   category: "Insurance" },
  { pattern: "krankenkasse", category: "Insurance" },

  // Healthcare
  { pattern: "apotheke",    category: "Healthcare" },
  { pattern: "pharmacy",    category: "Healthcare" },
  { pattern: "praxis",      category: "Healthcare" },
  { pattern: "klinikum",    category: "Healthcare" },

  // Bank fees
  { pattern: "kontoführung", category: "Bank fees" },
  { pattern: "kontofuehrung", category: "Bank fees" },
  { pattern: "gebühr",      category: "Bank fees" },
  { pattern: "gebuehr",     category: "Bank fees" },
  { pattern: "service fee", category: "Bank fees" },
  { pattern: "atm fee",     category: "Bank fees" },

  // Entertainment
  { pattern: "steam",       category: "Entertainment" },
  { pattern: "playstation", category: "Entertainment" },
  { pattern: "nintendo",    category: "Entertainment" },
  { pattern: "cinema",      category: "Entertainment" },
  { pattern: "kino",        category: "Entertainment" },

  // Shopping
  { pattern: "amazon",      category: "Shopping" },
  { pattern: "zalando",     category: "Shopping" },
  { pattern: "ikea",        category: "Shopping" },
  { pattern: "h&m",         category: "Shopping" },
  { pattern: "mediamarkt",  category: "Shopping" },
  { pattern: "saturn",      category: "Shopping" },
  { pattern: "apple store", category: "Shopping" },

  // Travel
  { pattern: "airbnb",      category: "Travel" },
  { pattern: "booking.com", category: "Travel" },
  { pattern: "lufthansa",   category: "Travel" },
  { pattern: "ryanair",     category: "Travel" },
  { pattern: "easyjet",     category: "Travel" },
  { pattern: "hotel ",      category: "Travel" },

  // Taxes
  { pattern: "finanzamt",   category: "Taxes" },
  { pattern: "tax office",  category: "Taxes" },

  // Income
  { pattern: "gehalt",      category: "Salary" },
  { pattern: "lohn ",       category: "Salary" },
  { pattern: "salary",      category: "Salary" },
  { pattern: "payroll",     category: "Salary" },
  { pattern: "erstattung",  category: "Refund" },
  { pattern: "refund",      category: "Refund" },
  { pattern: "rückerstattung", category: "Refund" },
  { pattern: "zinsen",      category: "Interest" },
  { pattern: "interest",    category: "Interest" },
  { pattern: "dividende",   category: "Investment income" },
  { pattern: "dividend",    category: "Investment income" },
];
