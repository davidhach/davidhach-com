/**
 * GoCardless Bank Account Data (formerly Nordigen) HTTP wrapper.
 *
 * Free tier covers ~2,500 European banks including Sparkasse, Consors, N26.
 * Read-only PSD2 AIS — there is no PIS scope and the requisition we create
 * doesn't request one.
 *
 * Access tokens last 24h, refresh tokens 30 days. We cache the access token
 * in process memory to avoid burning quota; the refresh token lives KEK-
 * encrypted on the BankConnection row.
 *
 * Env vars:
 *   GOCARDLESS_SECRET_ID, GOCARDLESS_SECRET_KEY — register at bankaccountdata.gocardless.com
 *   GOCARDLESS_REDIRECT_URL — public-https URL hitting /api/banks/gocardless/callback
 */
const BASE = "https://bankaccountdata.gocardless.com/api/v2";

interface TokenResp { access: string; access_expires: number; refresh: string; refresh_expires: number }

let cachedAccess: { token: string; expiresAt: number } | null = null;

function creds() {
  const id = process.env.GOCARDLESS_SECRET_ID;
  const key = process.env.GOCARDLESS_SECRET_KEY;
  if (!id || !key) throw new Error("GoCardless credentials not configured (GOCARDLESS_SECRET_ID/KEY)");
  return { id, key };
}

export async function getAccessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;
  const { id, key } = creds();
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
  });
  if (!res.ok) throw new Error(`GoCardless token: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as TokenResp;
  cachedAccess = { token: data.access, expiresAt: Date.now() + data.access_expires * 1000 };
  return data.access;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 204) return { ok: true, status: 204, data: null };
  // GoCardless returns 401 when the EUA/consent has expired or been revoked.
  const data = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, data };
}

// ─── Public helpers used by setup.ts + sync.ts ─────────────────────────────

export interface Institution {
  id: string;            // e.g. "SPARKASSE_DILLINGEN_NORDLINGEN_BYLADEM1DLG"
  name: string;
  bic?: string;
  countries: string[];
  logo?: string;
  transaction_total_days?: string;
}

export async function listInstitutions(country: string): Promise<Institution[]> {
  const { ok, data, status } = await call<Institution[]>(`/institutions/?country=${country.toUpperCase()}`);
  if (!ok || !data) throw new Error(`listInstitutions: ${status}`);
  return data;
}

export interface Requisition {
  id: string;
  link: string;          // user-facing redirect URL
  accounts: string[];    // populated after consent
  status?: string;
}

export async function createRequisition(args: {
  institutionId: string;
  redirect: string;
  reference: string;     // we pass our BankConnection.id so we can correlate on callback
}): Promise<Requisition> {
  const { ok, data, status } = await call<Requisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: args.redirect,
      institution_id: args.institutionId,
      reference: args.reference,
      user_language: "EN",
    }),
  });
  if (!ok || !data) throw new Error(`createRequisition: ${status}`);
  return data;
}

export async function getRequisition(id: string): Promise<Requisition> {
  const { ok, data, status } = await call<Requisition>(`/requisitions/${id}/`);
  if (!ok || !data) throw new Error(`getRequisition: ${status}`);
  return data;
}

export interface AccountMeta {
  id: string;
  iban?: string;
  institution_id?: string;
  status?: string;
  owner_name?: string;
}

export async function getAccountMeta(accountId: string): Promise<AccountMeta | { consentExpired: true }> {
  const { ok, data, status } = await call<AccountMeta>(`/accounts/${accountId}/`);
  if (status === 401 || status === 403) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getAccountMeta: ${status}`);
  return data;
}

export interface AccountDetails { account?: { currency?: string; name?: string; iban?: string } }
export async function getAccountDetails(accountId: string): Promise<AccountDetails | { consentExpired: true }> {
  const { ok, data, status } = await call<AccountDetails>(`/accounts/${accountId}/details/`);
  if (status === 401 || status === 403) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getAccountDetails: ${status}`);
  return data;
}

export interface BalancesResp {
  balances: Array<{
    balanceAmount: { amount: string; currency: string };
    balanceType: string;
    referenceDate?: string;
  }>;
}
export async function getBalances(accountId: string): Promise<BalancesResp | { consentExpired: true }> {
  const { ok, data, status } = await call<BalancesResp>(`/accounts/${accountId}/balances/`);
  if (status === 401 || status === 403) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getBalances: ${status}`);
  return data;
}

export interface TransactionsResp {
  transactions: {
    booked: Array<{
      transactionId?: string;
      bookingDate?: string;
      valueDate?: string;
      transactionAmount: { amount: string; currency: string };
      remittanceInformationUnstructured?: string;
      remittanceInformationStructured?: string;
      creditorName?: string;
      debtorName?: string;
    }>;
  };
}
export async function getTransactions(accountId: string, dateFrom?: string): Promise<TransactionsResp | { consentExpired: true }> {
  const qs = dateFrom ? `?date_from=${encodeURIComponent(dateFrom)}` : "";
  const { ok, data, status } = await call<TransactionsResp>(`/accounts/${accountId}/transactions/${qs}`);
  if (status === 401 || status === 403) return { consentExpired: true };
  if (!ok || !data) throw new Error(`getTransactions: ${status}`);
  return data;
}

export function isConsentExpired<T>(x: T | { consentExpired: true }): x is { consentExpired: true } {
  return typeof x === "object" && x !== null && "consentExpired" in x;
}
