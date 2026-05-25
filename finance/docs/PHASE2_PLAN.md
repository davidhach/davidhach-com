# Phase 2 — Read-only bank & crypto integrations

Build only after Phase 1 (auth, multi-currency UI, graph filters, asset adapters,
manual workflow, spending analytics) is stable in production.

## Scope (confirmed)

1. **GoCardless Bank Account Data (BAD)** — formerly Nordigen.
   Free tier covers Sparkasse Dillingen Nördlingen, Consors Bank, N26 GmbH and
   ~2,500 other EU institutions. Read-only PSD2 AIS only. No payment initiation.
2. **Crypto via public address tracking** — BTC (mempool.space) + ETH (any free
   public RPC, e.g. cloudflare-eth.com / ankr.com). User supplies public address
   strings only.
3. **Manual CSV import** — universal fallback for any institution.

## What the user does NOT consent to

- Payment Initiation Service (PIS). The connector layer must refuse to mount any
  scope that includes write/initiate verbs. Enforced in the GoCardless setup
  flow by requesting only AIS scopes.
- Storing custodial-exchange API keys (Binance/Coinbase/Kraken). Out of scope.

## Constraints recap

- **Vercel Hobby = 2 crons.** Both already in use. New bank refresh must fold
  into the existing daily FX cron (`/api/cron/daily`).
- **Cost ceiling: $0.** GoCardless free, public crypto RPCs free.
- **Encryption at rest** for tokens (access + refresh). Reuse `encryptStringWithKek`.

## Data-model deltas

```prisma
model BankConnection {
  id              String   @id @default(cuid())
  userId          String
  provider        String   // "gocardless" | "manual_csv" | "btc_address" | "eth_address"
  institutionId   String?  // GC institution_id, e.g. "SPARKASSE_DILLINGEN_NORDLINGEN"
  institutionName String
  status          BankConnectionStatus @default(PENDING)
  consentExpiresAt DateTime?
  // GoCardless requisition/EUA + per-account refs (encrypted)
  requisitionId   String?
  refreshTokenEnc String?  @db.Text
  // Crypto address (public, not sensitive but stored once)
  address         String?
  lastSyncedAt    DateTime?
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  links           BankAccountLink[]
  @@index([userId, status])
}

enum BankConnectionStatus {
  PENDING        // awaiting user consent
  ACTIVE
  CONSENT_EXPIRED
  ERROR
  REVOKED
}

model BankAccountLink {
  id              String   @id @default(cuid())
  userId          String
  connectionId    String
  finAccountId    String   // user-chosen target FinAccount
  externalId      String   // provider account id (GC accountId, BTC address, etc.)
  iban            String?
  currency        String
  lastBalance     Decimal? @db.Decimal(20, 2)
  lastBalanceAt   DateTime?
  createdAt       DateTime @default(now())
  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  connection      BankConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  finAccount      FinAccount     @relation(fields: [finAccountId], references: [id], onDelete: Restrict)
  @@unique([connectionId, externalId])
}
```

All additive. `FinAccount` gains no new fields — the link is in `BankAccountLink`.

## Module layout

```
src/lib/bank/
  index.ts              // registry: provider name -> adapter
  types.ts              // BankAdapter interface (connect, listAccounts, fetchBalance, fetchTransactions)
  gocardless/
    client.ts           // signed HTTP wrapper; token caching
    setup.ts            // build redirect URL → handle callback → store requisition
    sync.ts             // daily refresh: balances + transactions, dedupe via (date, amount, normalized desc)
  crypto/
    btc.ts              // mempool.space adapter: balance + utxos as a single Valuation
    eth.ts              // public RPC: eth_getBalance + ERC-20 read for stables
  csv/
    parse.ts            // user-uploaded statement CSV → Transaction[] (schema-validated)
```

Every adapter implements the same `BankAdapter` interface. The cron route just
iterates `BankConnection` rows where `status == ACTIVE` and dispatches to the
right adapter — no provider-specific code in the cron handler.

## Hard rules every adapter must follow

1. **Read-only by construction.** The adapter interface has no `initiateTransfer` /
   `postPayment` methods. There is no codepath that can call them even if the
   provider's SDK exposes them.
2. **Scoped permissions only.** GoCardless requisition is created with the AIS
   scopes only — never PIS.
3. **Token storage encrypted at rest.** Pass through `encryptStringWithKek` before
   `prisma.bankConnection.update`.
4. **Audit every fetch.** `recordAudit({ action: "bank.sync", targetType: "BankConnection", … })`.
5. **Consent expiry surfacing.** When GoCardless returns 401 / consent expired,
   set `status = CONSENT_EXPIRED` and surface a "reconnect" CTA on the dashboard.
   Do NOT silently retry or attempt to re-authenticate without the user.
6. **Idempotent transaction sync.** Dedupe by `(finAccountId, date, amount,
   merchantNormalized)` against existing `Transaction` rows — same key the OCR
   pipeline already uses.

## Cron fold-in

`/api/cron/daily` (today: FX + monthly snapshot on day 1) gains a third step:

```ts
// after FX refresh
const conns = await prisma.bankConnection.findMany({ where: { status: "ACTIVE" } });
for (const c of conns) {
  try { await getAdapter(c.provider).sync(c); }
  catch (err) { await markConnectionError(c, err); }
}
```

Failures on one connection must not abort the others.

## Phase 2 implementation order

1. Adapter interface + crypto/btc + crypto/eth (simplest, no OAuth dance).
2. CSV upload UI + parser (independent of the others; lets users start using bank
   data immediately while GoCardless onboarding is built).
3. GoCardless requisition flow (`/settings/banks/new` → redirect → callback →
   account-picker → link to FinAccount).
4. GoCardless sync logic + dedupe + consent-expiry handling.
5. Connection management UI: list, status, reconnect, disconnect.
6. End-to-end test with the three target German banks against the GoCardless
   sandbox.

## What I'm explicitly NOT doing in Phase 2

- Plaid, TrueLayer, MX, Yodlee. All have meaningful per-user costs.
- Direct screen-scraping of any bank. Brittle and ToS-hostile.
- Custodial exchange integrations (Binance, Coinbase, Kraken). Out of scope per
  the no-write-access rule and no-API-key rule.
- Background webhooks. Free-tier GoCardless does not include webhooks; daily
  pull is the supported model.

## Open questions for Phase 2 kickoff

- Which BTC/ETH addresses do you want tracked first? (one example for each is
  enough to validate the adapter).
- Should CSV import live alongside the existing statement-upload (OCR) flow, or
  replace it for bank-export downloads? Recommendation: keep both; OCR for
  screenshots, CSV for downloads.
