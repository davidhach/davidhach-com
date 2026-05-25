/**
 * Zod schemas shared between API handlers and clients.
 * The OCR schema is the contract the model must hit — and what we validate
 * the model's response against. Untrusted output never reaches the DB un-validated.
 */
import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const currency = z.string().length(3).toUpperCase();

export const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "expected a number with up to 2 decimals");

// ─── Entity / FinAccount / Asset / Liability ─────────────────────────────────

export const entityInput = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(["PERSONAL", "COMPANY", "TRUST", "JOINT", "INVESTMENT", "OTHER"]).default("PERSONAL"),
  currency: currency.default("USD"),
});

export const finAccountInput = z.object({
  entityId: z.string().cuid(),
  name: z.string().min(1).max(100),
  institution: z.string().max(100).optional(),
  kind: z.enum([
    "CHECKING", "SAVINGS", "CREDIT_CARD", "BROKERAGE", "RETIREMENT",
    "CRYPTO_WALLET", "CASH", "LOAN", "MORTGAGE", "REAL_ESTATE", "OTHER",
  ]),
  currency: currency.default("USD"),
});

export const assetClassEnum = z.enum([
  "CASH", "EQUITY", "STOCKS", "COMPANY_SHARES", "BOND", "CRYPTO", "REAL_ESTATE",
  "COMMODITY", "PRIVATE_EQUITY", "COLLECTIBLE", "RETIREMENT", "RECEIVABLE",
  "LOAN_RECEIVABLE", "OTHER",
]);

export const priceSourceField = z.enum(["stooq", "coingecko", "metals", "manual"]);

export const assetInput = z.object({
  entityId: z.string().cuid(),
  finAccountId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  customClassId: z.string().cuid().optional(),
  name: z.string().min(1).max(120),
  symbol: z.string().max(20).optional(),
  assetClass: assetClassEnum.default("CASH"),
  currency: currency.default("USD"),
  quantity: moneyString.optional(),
  costBasis: moneyString.optional(),
  currentValue: moneyString,
  priceSource: priceSourceField.optional(),
  externalRef: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const liabilityInput = z.object({
  entityId: z.string().cuid(),
  finAccountId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  name: z.string().min(1).max(120),
  kind: z.enum(["CREDIT_CARD", "LOAN", "MORTGAGE", "STUDENT_LOAN", "TAX", "PAYABLE", "OTHER"]).default("LOAN"),
  currency: currency.default("USD"),
  principal: moneyString.optional(),
  interestRate: moneyString.optional(),
  currentValue: moneyString,
  dueDate: isoDate.optional(),
  notes: z.string().max(2000).optional(),
});

export const valuationInput = z.object({
  assetId: z.string().cuid().optional(),
  liabilityId: z.string().cuid().optional(),
  date: isoDate,
  value: moneyString,
  quantity: moneyString.optional(),
  currency: currency.default("USD"),
  source: z.enum(["MANUAL", "IMPORT", "MARKET_FEED", "RECONCILED"]).default("MANUAL"),
  note: z.string().max(500).optional(),
}).refine((v) => !!v.assetId !== !!v.liabilityId, "exactly one of assetId/liabilityId");

// ─── Transactions ────────────────────────────────────────────────────────────

export const transactionInput = z.object({
  finAccountId: z.string().cuid(),
  categoryId: z.string().cuid().optional(),
  date: isoDate,
  amount: moneyString,
  currency: currency.default("USD"),
  description: z.string().min(1).max(500),
  merchant: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});

// ─── OCR contract ────────────────────────────────────────────────────────────
// This is the JSON the Claude vision pass is required to produce. We validate
// strictly — anything that doesn't match is dropped with a warning, not saved.

export const extractedTransaction = z.object({
  date: isoDate,
  description: z.string().min(1).max(500),
  merchant: z.string().max(200).optional().nullable(),
  amount: moneyString, // negative = outflow / debit
  currency: currency.default("USD"),
  categoryGuess: z.string().max(80).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const ocrResponse = z.object({
  accountHint: z.string().max(200).optional().nullable(),
  statementPeriod: z
    .object({ start: isoDate.optional().nullable(), end: isoDate.optional().nullable() })
    .optional()
    .nullable(),
  detectedCurrency: currency.optional().nullable(),
  transactions: z.array(extractedTransaction),
  warnings: z.array(z.string().max(500)).optional().nullable(),
  overallConfidence: z.number().min(0).max(1).optional().nullable(),
});

export type ExtractedTransaction = z.infer<typeof extractedTransaction>;
export type OcrResponse = z.infer<typeof ocrResponse>;

// ─── Auth ────────────────────────────────────────────────────────────────────
// Strength enforcement happens in src/lib/password.ts; these schemas only check
// shape/length so we can return a parse error before hitting argon2.

export const emailField = z.string().email().max(254).toLowerCase();
export const passwordField = z.string().min(1).max(256);
export const totpCode = z.string().regex(/^\s*\d{6}\s*$/, "6-digit code");
export const recoveryCodeField = z.string().min(8).max(32);

export const passwordLoginInput = z.object({
  email: emailField,
  password: passwordField,
  totp: totpCode.optional(),
  recoveryCode: recoveryCodeField.optional(),
});

export const passwordSetInput = z.object({
  newPassword: passwordField,
  currentPassword: passwordField.optional(), // required when a password already exists
});

export const passwordResetRequestInput = z.object({ email: emailField });
export const passwordResetConfirmInput = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordField,
});

export const totpConfirmInput = z.object({ code: totpCode });
export const totpDisableInput = z.object({ password: passwordField });
