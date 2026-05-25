/**
 * Enable Banking API client.
 *
 * Replaces GoCardless as the EU PSD2 AIS provider (GoCardless Bank Account Data
 * closed to new signups). Free tier covers SE/DE/FR/etc. ASPSPs with a 180-day
 * consent. Strictly read-only — this module has no PIS / payment-initiation
 * code paths.
 *
 * Auth: JWT (RS256) signed with the private key the user uploads to Enable
 * Banking when registering their application. The `kid` claim is the
 * application_id (UUID).
 *
 * Env:
 *   ENABLE_BANKING_APP_ID         UUID issued by Enable Banking
 *   ENABLE_BANKING_PRIVATE_KEY    PEM-encoded RSA private key (paste the whole
 *                                 -----BEGIN PRIVATE KEY-----... block as-is)
 *   ENABLE_BANKING_REDIRECT_URL   Optional override for the consent redirect.
 *                                 Defaults to <AUTH_URL>/api/banks/enablebanking/callback
 */
import { createSign } from "node:crypto";

// Enable Banking uses the same hostname for both environments today; the
// sandbox/production split is per-Application in their control panel. The
// `ENABLE_BANKING_ENV` var is mostly a safety label surfaced in the UI so the
// user can tell at a glance which mode they're in. `ENABLE_BANKING_BASE_URL`
// is an escape hatch in case Enable Banking ever splits hosts.
export type EnableBankingEnv = "sandbox" | "production";

export function activeEnv(): EnableBankingEnv {
  return process.env.ENABLE_BANKING_ENV === "sandbox" ? "sandbox" : "production";
}

function baseUrl(): string {
  return process.env.ENABLE_BANKING_BASE_URL?.replace(/\/+$/, "") ?? "https://api.enablebanking.com";
}

function appId(): string {
  const v = process.env.ENABLE_BANKING_APP_ID;
  if (!v) throw new Error("ENABLE_BANKING_APP_ID is not set");
  return v;
}

function privateKey(): string {
  const v = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!v) throw new Error("ENABLE_BANKING_PRIVATE_KEY is not set");
  // Vercel env vars frequently lose newlines if pasted as a single line —
  // accept either real newlines or "\n"-escaped form.
  return v.includes("\\n") ? v.replace(/\\n/g, "\n") : v;
}

export function isConfigured(): boolean {
  return !!(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

// ─── JWT ────────────────────────────────────────────────────────────────────

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Pure helper, exported for tests. Signs an RS256 JWT with the given key. */
export function signJwt(payload: object, kid: string, privateKeyPem: string): string {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const sig = b64url(signer.sign(privateKeyPem));
  return `${data}.${sig}`;
}

function makeToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 3600,
    },
    appId(),
    privateKey(),
  );
}

// ─── HTTP wrapper ──────────────────────────────────────────────────────────

async function call<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null; text?: string }> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${makeToken()}`,
    },
  });
  if (res.status === 204) return { ok: true, status: 204, data: null };
  const text = await res.text();
  let data: T | null = null;
  try { data = text ? (JSON.parse(text) as T) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

// ─── Public surface ────────────────────────────────────────────────────────

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  maximum_consent_validity?: number;
}

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const { ok, data, status, text } = await call<{ aspsps: Aspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country)}`,
  );
  if (!ok || !data) throw new Error(`listAspsps ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data.aspsps ?? [];
}

export interface AuthStart {
  url: string;
  authorization_id: string;
  psu_id_hash?: string;
}

export async function startAuth(args: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;          // our BankConnection.id
  validityDays?: number;  // default 180
  psuType?: "personal" | "business";
}): Promise<AuthStart> {
  const validUntil = new Date();
  validUntil.setUTCDate(validUntil.getUTCDate() + (args.validityDays ?? 180));
  const { ok, data, status, text } = await call<AuthStart>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil.toISOString() },
      aspsp: { name: args.aspspName, country: args.aspspCountry },
      state: args.state,
      redirect_url: args.redirectUrl,
      psu_type: args.psuType ?? "personal",
    }),
  });
  if (!ok || !data?.url) throw new Error(`startAuth ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data;
}

export interface SessionAccount {
  uid: string;
  identification_hash?: string;
  identification_hashes?: string[];
  account_id?: { iban?: string; other?: { identification?: string } };
  currency: string;
  name?: string;
  product?: string;
  account_type?: string;
}

export interface Session {
  session_id: string;
  status: string;
  accounts: SessionAccount[];
  accounts_data?: Array<{ uid: string; account_id?: { iban?: string }; currency: string; name?: string }>;
}

/** Exchange the code returned by the consent callback for a session + accounts. */
export async function createSession(code: string): Promise<Session> {
  const { ok, data, status, text } = await call<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!ok || !data?.session_id) throw new Error(`createSession ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data;
}

/** Fetch a session by id (also returns its accounts). */
export async function getSession(sessionId: string): Promise<Session | { consentExpired: true }> {
  const { ok, data, status, text } = await call<Session>(`/sessions/${sessionId}`);
  if (status === 401 || status === 403 || status === 410) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getSession ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data;
}

export interface BalancesResp {
  balances: Array<{
    balance_amount: { amount: string; currency: string };
    balance_type: string;
    reference_date?: string;
  }>;
}

export async function getBalances(accountUid: string): Promise<BalancesResp | { consentExpired: true }> {
  const { ok, data, status, text } = await call<BalancesResp>(`/accounts/${accountUid}/balances`);
  if (status === 401 || status === 403 || status === 410) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getBalances ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data;
}

export interface TransactionsResp {
  transactions: Array<{
    entry_reference?: string;
    merchant_category_code?: string;
    transaction_amount: { amount: string; currency: string };
    creditor?: { name?: string };
    debtor?: { name?: string };
    remittance_information?: string[];
    booking_date?: string;
    value_date?: string;
    transaction_date?: string;
    status?: string;
    credit_debit_indicator?: "CRDT" | "DBIT";
  }>;
  continuation_key?: string;
}

export async function getTransactions(
  accountUid: string,
  args: { dateFrom?: string; dateTo?: string; continuationKey?: string } = {},
): Promise<TransactionsResp | { consentExpired: true }> {
  const qs = new URLSearchParams();
  if (args.dateFrom) qs.set("date_from", args.dateFrom);
  if (args.dateTo) qs.set("date_to", args.dateTo);
  if (args.continuationKey) qs.set("continuation_key", args.continuationKey);
  const suffix = qs.toString() ? `?${qs}` : "";
  const { ok, data, status, text } = await call<TransactionsResp>(
    `/accounts/${accountUid}/transactions${suffix}`,
  );
  if (status === 401 || status === 403 || status === 410) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getTransactions ${status}: ${text?.slice(0, 200) ?? ""}`);
  return data;
}

export function isConsentExpired<T>(x: T | { consentExpired: true }): x is { consentExpired: true } {
  return typeof x === "object" && x !== null && "consentExpired" in x;
}
