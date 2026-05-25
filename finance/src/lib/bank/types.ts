/**
 * BankAdapter — read-only interface every connector implements.
 *
 * HARD RULE: this interface has no `initiateTransfer`, `postPayment`, or any
 * other write method. There is no codepath in the app that could initiate a
 * transaction against your bank, by design. Don't add one without a deliberate
 * security review.
 *
 * Each adapter handles one provider (gocardless, btc_address, eth_address,
 * manual_csv). The cron's daily sync iterates BankConnection rows where
 * status == ACTIVE and dispatches to the matching adapter — no provider-
 * specific code lives in the cron handler.
 */
import { Decimal } from "decimal.js";

export interface AdapterAccount {
  externalId: string;        // provider's account id
  iban?: string | null;
  currency: string;
  displayName: string;       // shown to the user when picking which FinAccount to map to
  balance?: Decimal | null;
}

export interface AdapterTransaction {
  externalId?: string | null;  // some providers give one; if not we dedupe by content
  date: Date;                  // posting date
  amount: Decimal;             // signed: negative = outflow, positive = inflow
  currency: string;
  description: string;
  merchant?: string | null;
}

export interface AdapterBalance {
  externalId: string;
  amount: Decimal;
  currency: string;
  asOf: Date;
}

export interface SyncResult {
  balances: AdapterBalance[];
  /** Map of externalId → transactions for that account. */
  transactions: Record<string, AdapterTransaction[]>;
  /** Set to true when the provider returns "consent expired" — caller transitions to CONSENT_EXPIRED. */
  consentExpired?: boolean;
}

export interface BankAdapter {
  id: string;
  /**
   * Pull current balances + recent transactions for every linked account.
   * Returning empty arrays is fine; throwing should be reserved for transport
   * errors so the caller can mark `status = ERROR` and surface a CTA.
   */
  sync(args: SyncArgs): Promise<SyncResult>;
}

export interface SyncArgs {
  connection: BankConnectionLike;
  /** External account ids that have BankAccountLink rows. Adapters can use this to skip work. */
  linkedExternalIds: string[];
}

/** Just enough of the Prisma BankConnection shape to keep adapters DB-agnostic in tests. */
export interface BankConnectionLike {
  id: string;
  userId: string;
  provider: string;
  institutionId: string | null;
  institutionName: string;
  requisitionId: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  address: string | null;
}
