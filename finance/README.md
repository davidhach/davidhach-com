# Ledger — Personal Finance & Net Worth

A spreadsheet replacement for tracking net worth, asset performance, and spending —
with statement-screenshot OCR so you stop typing numbers by hand.

This repo contains:

- **Web app + API** (Next.js 15, TypeScript, PostgreSQL, Prisma) — the source of truth.
- **iOS app** (SwiftUI) — first-class native client against the same API.
- **OCR pipeline** powered by the Claude vision API.
- **Encrypted backups** to object storage + portable CSV/JSON export.

> Single-user product by design. The schema is multi-user-clean so it can grow into
> shared accounts later, but the UX assumes one human.

---

## Product spec (MVP)

1. **Net worth tracking** — Entities → Accounts → (Assets | Liabilities). Each has a
   currency, current value, optional cost basis, and unlimited time-stamped
   **valuations** (the time series). Monthly auto-snapshots + on-demand snapshots.
2. **Performance tracking** — gain/loss vs. cost basis, growth rate per asset/class,
   allocation drift over time, annotated events (transfers, contributions, one-offs).
3. **Statement OCR** — upload a screenshot → Claude vision extracts a structured list
   of transactions → you review & confirm → saved as `Transaction` rows tied to an
   account. Duplicates flagged by `(date, amount, merchant_normalized)` fuzzy match.
4. **Spending analysis** — totals by category / merchant / account / time window. Auto
   categorization via the OCR pass; manual override always wins.
5. **Customization** — user-defined categories, tags, currencies, display preferences,
   goals. Display currency converts via daily FX snapshots.
6. **Security & backup** — envelope-encrypted statement files at rest, audit log on
   every mutation, nightly encrypted DB backup to R2, one-click CSV+JSON export.

v2 (designed-for, not built): Plaid/GoCardless import, shared entities, push, goal
tracking with milestones, scheduled budgets, on-device receipt capture.

---

## Tech stack & why

| Layer | Choice | Why |
|---|---|---|
| Web + API | **Next.js 15 App Router** | One project, one deploy. RSC for fast dashboards, route handlers for the JSON API the iOS app consumes. |
| Language | **TypeScript** end-to-end | Catches schema drift between server↔client↔mobile. |
| DB | **PostgreSQL 16** | Boring, correct, has the JSON & numeric types this domain needs. Hosted on Neon (branching dev DBs are nice). |
| ORM | **Prisma** | Declarative schema, migrations, generated types. Trade-off: heavier than `pg`; worth it for safety. |
| Auth | **Auth.js v5** with passkeys (WebAuthn) + email magic link fallback | No passwords to leak. Passkeys are first-class on iOS. |
| File storage | **Cloudflare R2** (S3-compatible) | Cheap egress, S3 SDK works unchanged. |
| Encryption | **AES-256-GCM** envelope encryption for statement images | Files unreadable without the KEK even if the bucket leaks. |
| OCR | **Claude vision** (`claude-sonnet-4-6`) | One-shot structured extraction with categorization. Beats Textract→LLM-cleanup pipeline on quality and code. |
| Charts | **Recharts** (web), **Swift Charts** (iOS) | Native to each platform. |
| UI | **Tailwind + handwritten primitives** | shadcn/ui patterns without the dependency churn. |
| Mobile | **SwiftUI** | First-class iPhone experience; talks to the Next.js API directly. |
| Hosting | **Vercel** (web), **Neon** (DB), **R2** (files) | All free-tier-friendly. |
| Backups | `pg_dump` → AES-256-GCM → R2, scheduled via Vercel Cron | Restoreable from CLI. |
| Tests | **Vitest** | Fast, ESM-native, plays well with Next. |

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Database schema

See [`prisma/schema.prisma`](./prisma/schema.prisma) — fully commented.

---

## Local setup

```bash
# 1. Prereqs: Node 20+, pnpm, a Postgres URL, an Anthropic API key, an R2 bucket
cp .env.example .env.local        # fill in DATABASE_URL, ANTHROPIC_API_KEY, R2_*, AUTH_SECRET, MASTER_KEK
pnpm install
pnpm prisma migrate dev           # creates the schema
pnpm prisma db seed               # demo data: 1 user, a few accounts, 6 months of snapshots
pnpm dev                          # http://localhost:3000
```

For OCR to work, set `ANTHROPIC_API_KEY`. For uploads to work, set the R2 env vars
(or point them at MinIO locally — the S3 client doesn't care).

## Production deploy

```bash
# Vercel
vercel link
vercel env add DATABASE_URL          # Neon pooled connection string
vercel env add ANTHROPIC_API_KEY
vercel env add R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
vercel env add AUTH_SECRET           # `openssl rand -base64 32`
vercel env add MASTER_KEK            # `openssl rand -base64 32` — DO NOT rotate without re-wrapping
vercel deploy --prod
```

The Vercel Cron jobs in [`vercel.json`](./vercel.json) run nightly backups and
monthly net-worth snapshots.

## iOS setup

See [`ios/README.md`](./ios/README.md).

---

## Security model

- **Transport:** HTTPS everywhere (Vercel terminates).
- **Auth:** Passkey-first (WebAuthn). Email magic link as recovery. Sessions are
  database-backed, rotating, with 30-day idle expiry.
- **At rest, DB:** provider-encrypted (Neon). Application-level secrets (KEK) live in
  Vercel env, never in the DB.
- **At rest, statement files:** envelope encryption. For each upload we generate a
  random 32-byte DEK, encrypt the file body with AES-256-GCM, wrap the DEK with the
  KEK, and store the wrapped DEK + IV alongside the object metadata. The plaintext
  body never touches disk.
- **OCR:** the file body is decrypted in memory, sent to the Anthropic API over TLS,
  and discarded. Anthropic does not train on API inputs.
- **Audit log:** every mutating API call writes an `AuditLog` row with actor, action,
  target, before/after snapshot, IP, and user agent. Append-only by convention; no
  delete route exists.
- **Backups:** `pg_dump --format=custom` piped through AES-256-GCM into R2 under
  `backups/YYYY-MM-DD.dump.enc`. Restore: `scripts/restore.sh <date>`.
- **Data export:** `/api/export` produces a ZIP with CSV per table + a single JSON
  document — your data, your hard drive.
- **Least privilege:** the Prisma client connects with a role that has only
  `SELECT/INSERT/UPDATE` on the app schema; backups use a separate read-only role.

---

## Tests

```bash
pnpm test          # vitest
pnpm test:e2e      # (optional) playwright against a local server
```

The OCR test uses a fixture image and a recorded Claude response so it runs offline.

---

## Project layout

```
finance/
├── prisma/                 # schema + seed
├── src/
│   ├── app/                # Next.js routes (UI + API)
│   ├── components/         # React components
│   ├── lib/                # db, auth, crypto, storage, ocr, fx, audit, validation
│   └── types/
├── scripts/                # backup + cron jobs
├── tests/                  # vitest
└── ios/                    # SwiftUI app
```
