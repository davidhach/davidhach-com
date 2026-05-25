# Ledger — working notes for Claude

Single-user personal finance / net-worth app. **Handles real money and sensitive
financial data — security and data integrity come before everything else.**

## Where it runs

- **Repo:** `davidhach/davidhach-com` (GitHub). This app lives in the `finance/` subdirectory.
- **Vercel:** project `ledger`, **Root Directory = `finance`**, Hobby plan. Production: https://ledger-pi-livid.vercel.app
- **Deploy loop:** push to `main` → Vercel auto-deploys. The `vercel-build` script
  (`prisma migrate deploy && prisma generate && next build`) runs DB migrations
  automatically on every deploy — no manual DB step.
- **Stack:** Next.js 15 (App Router), Prisma + Neon Postgres, Auth.js v5 (passwordless
  email magic-link), Cloudflare R2 (encrypted statement files), Anthropic vision (OCR),
  Resend (login emails). iOS SwiftUI client in `ios/`.

## Hard constraints / gotchas (learned the hard way)

- **Vercel Hobby allows max 2 cron jobs.** `vercel.json` must stay at ≤2. A 3rd makes the
  build pass but the deployment fail *after* build. The daily cron at `/api/cron/fx`
  now does THREE things in order: FX refresh → price-adapter refresh (every asset with a
  non-manual `priceSource`) → monthly snapshot (when UTC day-of-month == 1). Failures in
  one step are logged but don't abort the others.
- **Vercel blocks deploying vulnerable Next.js versions.** Keep Next on a patched release
  (currently `15.5.18`). Don't downgrade into a flagged version.
- **Secrets live ONLY in Vercel env vars, never in the repo.** `.env*` is gitignored.
  `MASTER_KEK` is the encryption key for statement files — irreplaceable, never log/rotate
  it carelessly.
- **Email:** `EMAIL_SERVER` = `smtps://resend:<re_KEY>@smtp.resend.com:465` (username is the
  literal word `resend`). `EMAIL_FROM` stays `Ledger <onboarding@resend.dev>` — Resend test
  mode only delivers to the account owner's own email; do NOT switch to an `@davidhach.com`
  from-address unless that domain is verified in Resend first.
- **DB:** use Neon's **pooled** connection string for `DATABASE_URL`. New schema changes
  need a real Prisma migration in `prisma/migrations/` (so `migrate deploy` applies it).
- **Deps:** `@simplewebauthn/*` and the `argon2` npm package were removed (unused + peer
  conflict with next-auth). For password hashing we use `@node-rs/argon2` instead — it has
  no peer-dep conflict. Don't switch back to `argon2`.
- **Password + TOTP** layer (added Phase 1) lives alongside magic-link. Custom login route
  at `/api/auth/password/login` creates `Session` rows directly so DB sessions still work
  (Auth.js Credentials provider can't do DB sessions). TOTP secrets are KEK-encrypted in
  `User.totpSecretEnc`; recovery codes are argon2id-hashed in `User.recoveryCodesHash`.
- **Price adapters** live under `src/lib/price-adapters/`. Each implements `fetch(ref)`
  returning `{ price, currency, date }` or `null`. `priceSource = "manual"` is a sentinel
  meaning "don't auto-refresh, the user maintains values via `/update`".
- **Net-worth series** (chart filter API): `src/lib/series.ts`. Spans ≤ 90 days are computed
  daily from `Valuation` rows; longer spans use `Snapshot` rows converted at each
  snapshot's own date for honest history. The legacy `?months=` mode on `/api/snapshots`
  is preserved so the iOS client doesn't break.
- **iOS biometric lock**: `BiometricLock` (foreground re-lock after 60s idle) plus a
  `SecAccessControl`-bound keychain item for the session cookie. The lock is *device-local*
  only — the server still demands a real session token.
- **Bank / crypto / CSV connectors** (Phase 2) live under `src/lib/bank/`. Every adapter
  implements `BankAdapter.sync()` — **no write methods exist by design**, so the app
  literally cannot initiate a payment. `BankConnection` rows are dispatched to adapters
  by the daily cron via `runSync(connectionId)`. Transaction dedupe uses
  `(finAccountId, date, amount, merchantNormalized)` — same key as OCR.
- **EU-bank provider is Enable Banking** (`src/lib/bank/enablebanking/`). Auth is a JWT
  signed RS256 with `ENABLE_BANKING_PRIVATE_KEY` (PEM) and `kid` = `ENABLE_BANKING_APP_ID`.
  `ENABLE_BANKING_ENV` ("sandbox" | "production") is a UI safety label only — the API
  host is the same either way; sandbox vs production lives per-Application in their
  control panel. Optional `ENABLE_BANKING_BASE_URL` override. Consent flow:
  `POST /auth` → bank redirect → callback at exactly `/api/banks/enablebanking/callback`
  → `POST /sessions` exchanges the code for a session_id (stored on
  `BankConnection.requisitionId` — column reused) → `GET /accounts/{uid}/balances` and
  `/transactions`. Without the env vars the connect page shows a friendly setup guide;
  BTC/ETH/CSV still work.
- **Public legal pages** at `/privacy` and `/terms` live OUTSIDE the `(app)` auth group
  (under `src/app/privacy/` and `src/app/terms/` with a shared `LegalShell` component).
  They must render for logged-out visitors — needed for Enable Banking's production
  application review. Footer links from `/login`.
- **GoCardless is legacy**. Adapter kept registered so existing rows continue to sync,
  but the Connect UI no longer offers it — GoCardless closed signups.
- **ISIN → ticker** resolution uses OpenFIGI (free, no key required; `OPENFIGI_API_KEY`
  raises the rate limit). Cached in `IsinMapping`. The resolver scores candidates by
  preferred currency (huge weight), home exchange, and security type, then VALIDATES
  by fetching a live Stooq quote — picks the first listing that actually returns one.
  Without that, EUR ETFs were getting matched to LSE pence listings. Accepts an
  optional `preferredCurrency` parameter; the new-asset form passes the user's currency.
- **Stooq UK pence** handling: LSE quotes are in pence (GBp). `parseStooqCsv` multiplies
  by `.unitScale` per suffix (UK = 0.01) and reports GBP, so values are always in major
  units. Without this a 99-share holding showed £2.6M instead of £26k.
- **Yahoo Finance fallback**: `src/lib/price-adapters/yahoo.ts` (v8 chart endpoint)
  kicks in when Stooq returns nothing — the common failure mode for thin-volume UCITS
  ETFs. `refreshAssetPrice` chains stooq → yahoo automatically. Yahoo's `GBp` currency
  is auto-converted to GBP × 0.01. If BOTH sources fail, `currentValue` is NOT touched
  — the row gets a `[price]` note and the assets table renders "(unavailable)".
- **All upstream fetches are bounded.** `src/lib/net.ts::fetchWithTimeout` wraps every
  external HTTP (Stooq, Yahoo, CoinGecko, OpenFIGI). Without this, a hung upstream
  blocked the Add-asset form indefinitely (IE00BKM4GZ66 case).
- **ISIN resolution is non-blocking.** The Add-asset form can save STOCKS with just an
  ISIN and no resolved ticker — the server writes `symbol = ISIN`, leaves `priceSource`
  null, and the client fires `POST /api/assets/[id]/resolve` in the background. The
  /assets row shows a "Resolving…" / "Resolve" affordance for assets in that state.
- **Transfers + card settlements:** `Transaction.transferPairId` self-FK + `transferKind`
  enum (`TRANSFER` | `CARD_PAYMENT`) + `excludeFromTotals` bool. `src/lib/transfer-detect.ts`
  scans for outflow/inflow pairs (same entity, different accounts, ±5d, same amount
  with FX tolerance). Surfaced as suggestions on /spending; the user confirms via
  `/api/transfers/confirm` which pairs both rows and sets the exclude flag. Manual
  `/api/transfers/unpair` reverses it. Spending/income totals always skip excluded txns.
- **Default merchant→category rules** seeded by `POST /api/categories/seed-defaults`
  (DEFAULT_CATEGORIES + DEFAULT_RULES in `src/lib/default-categories.ts`). Idempotent;
  also backfills uncategorised txns. New bank-synced txns auto-categorise via the
  existing `applyRulesToTransaction` hook in the orchestrator.
- **Auto-managed Assets** from connections: every BankAccountLink produces one Asset
  row (`Asset.managedByLinkId` FK, onDelete: Cascade). BANK → CASH at `lastBalance`,
  `btc_address` → CRYPTO "Bitcoin" (coingecko: bitcoin), `eth_address` → CRYPTO
  "Ethereum" (coingecko: ethereum). Upsert keyed on `managedByLinkId` so re-syncs
  never duplicate. PATCH/DELETE on `/api/assets/[id]` and AssetTransaction POST
  refuse with 409 for managed rows; the only way to remove one is to disconnect
  the connection (the cascade tears the asset down). The /assets row + detail
  page show a 🔒 auto-synced badge and hide Edit/Delete.
- **ETH adapter** tries `ETH_RPC_URL` (if set) then publicnode → llamarpc → ankr,
  each through `fetchWithTimeout(4s)`. Real RPC errors surface in the connection's
  `lastError` instead of a generic 500. Wei→ETH via BigInt to keep sub-gwei precision.
- **FX conversion is resilient.** `convertSafe()` in `src/lib/fx.ts` never throws on
  a missing rate; the dashboard, series, and spending all use it. Missing-rate path:
  cached prior date → on-demand single-pair `ensureFxRate()` → any-direction fallback
  → return ok:false + reason. The dashboard renders a yellow banner listing affected
  currencies. The daily cron also tops up any currency the user actually holds.
- **Quantity-based assets** (STOCKS / CRYPTO with a non-manual `priceSource`): the
  authoritative ledger is `AssetTransaction` (BUY / SELL / TRANSFER_IN / SPLIT / DIVIDEND).
  `Asset.quantity` + `Asset.currentValue` are denormalised caches recomputed on every
  AssetTransaction insert and overwritten by the daily price cron. `PriceHistory` persists
  per-(source, ref, date) prices so historical value = quantity × price-at-date.
  Manual assets keep using `Valuation` exactly as before — both code paths coexist.
- **Suggested trades**: `src/lib/suggested-trades.ts` detects KAUF/VERKAUF/BUY/SELL on
  connected-cash `Transaction.description`. The user confirms via `/api/trades/confirm`,
  which creates an `AssetTransaction` with `sourceTxId = <Transaction.id>` so the same
  cash row never re-suggests.
- **Broker depot CSV**: PSD2 doesn't expose depot positions, so we accept a positions
  CSV at `/api/banks/csv/depot/{preview,commit}`. Each row find-or-creates an Asset and
  records a `TRANSFER_IN` AssetTransaction (not BUY — opening position, not a real trade).
- **Dashboard entity filter** uses `?entity=<id>` and runs the URL through a whitelist
  of the user's own entities before any DB query. `liveNetWorth(userId, { entityId })`
  and `aggregateNetWorth(...)` (pure, unit-tested) do the math.

## Security model — preserve it

- Every page under `src/app/(app)/` is gated by `auth()` in the group layout (redirects to
  `/login`). Every `/api` data route calls `requireUserId()` and 401s without a session.
  Cron routes (`/api/cron/*`) require `Authorization: Bearer ${CRON_SECRET}`.
- **Any new data route MUST call `requireUserId()`** and scope all queries by `userId`.
  Never add an unauthenticated route that reads/writes user data.

## Architecture principles (owner's stated priorities)

- Backend must stay **free / low-cost**. Avoid always-on services.
- Prefer **scheduled daily syncs, on-login refresh, and on-demand fetches** over constant
  polling / real-time.
- Keep it **lightweight, simple, fast, reliable**.
- New features must integrate cleanly into the existing schema **without breaking current data**.

## Before pushing

Run locally: `npm install`, `npx tsc --noEmit`, `npm run build`, `npm test` (vitest).
Note: route handlers using zod `.default()` can trip `tsc` strictness — coalesce
(`body.x ?? default`) if the compiler flags a defaulted field as possibly undefined.
