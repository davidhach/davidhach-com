# Architecture

## System diagram

```
                       ┌──────────────────────────┐
                       │       iPhone (iOS 17+)   │
                       │  SwiftUI · Keychain ·    │
                       │  Face ID · Swift Charts  │
                       └────────────┬─────────────┘
                                    │ HTTPS + Bearer (session token from passkey/magic link)
                                    │
                          ┌─────────▼──────────┐
   ┌──────────────────────┤   Next.js 15 App   ├──────────────────────┐
   │                      │   (Vercel Edge +   │                      │
   │   Web client (RSC +  │   Node runtime)    │                      │
   │   client islands)    │                    │                      │
   │                      │   /app  – pages    │                      │
   │                      │   /api  – JSON     │                      │
   └─────────┬────────────┴────────┬───────────┴────────┬─────────────┘
             │                     │                    │
             │ Prisma              │ S3 SDK             │ HTTPS
             ▼                     ▼                    ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐
   │  PostgreSQL 16   │  │ Cloudflare R2    │  │  Anthropic API     │
   │  (Neon)          │  │ statements/      │  │  claude-sonnet-4-6 │
   │  app schema      │  │ backups/         │  │  vision OCR        │
   └──────────────────┘  └──────────────────┘  └────────────────────┘
             ▲                     ▲
             │ pg_dump             │ AES-256-GCM ciphertext
             │                     │
             └───── Vercel Cron ───┘
                  (nightly backup,
                   monthly snapshot)
```

## Data flow: statement upload

```
 user                  Next.js                Prisma            R2              Claude
  │                       │                      │              │                │
  │── PUT file ──────────▶│                      │              │                │
  │                       │── gen DEK ──┐         │              │                │
  │                       │  AES-GCM(file, DEK)─▶ │── PUT ciphertext ─▶│         │
  │                       │  wrap(DEK,KEK)        │              │                │
  │                       │── insert StatementUpload ▶│          │                │
  │                       │           (status=PENDING) │         │                │
  │◀── 200 { id, status }─│                      │              │                │
  │                       │                      │              │                │
  │── POST /statements/:id/parse ───────────────▶│              │                │
  │                       │── GET ciphertext ───────────────────▶│               │
  │                       │   unwrap DEK, decrypt in mem         │               │
  │                       │── images.create ────────────────────────────────────▶│
  │                       │                                                       │
  │                       │◀── structured tx list ───────────────────────────────│
  │                       │── insert OcrExtraction +             │               │
  │                       │   pending Transaction rows ─▶        │               │
  │◀── transactions[]  ───│                                                       │
  │                       │                                                       │
  │── PATCH /transactions (review edits, confirm) ─▶                              │
  │                       │── update + mark confirmed ─▶                          │
  │◀── ok ────────────────│                                                       │
```

## Data flow: net worth dashboard

1. Client requests `/api/snapshots?range=12m&currency=USD`.
2. API reads `Snapshot` rows for the user, joins to per-account/asset breakdowns.
3. FX rates from `FxRate` convert to the requested display currency at each
   snapshot's date (not today's rate — important for honest history).
4. Result streamed to the client; charts render with Recharts (web) / Swift Charts (iOS).

## Module map

| Module | Responsibility |
|---|---|
| `src/lib/db.ts` | Prisma singleton. |
| `src/lib/auth.ts` | Auth.js config — passkeys, magic links, session callbacks. |
| `src/lib/crypto.ts` | Envelope encryption (AES-256-GCM). DEK generation, wrap/unwrap. |
| `src/lib/storage.ts` | S3 client (R2). `putEncrypted`, `getDecrypted`, signed URLs. |
| `src/lib/ocr.ts` | Claude vision call. Returns validated `ExtractedTransaction[]`. |
| `src/lib/fx.ts` | FX rates: fetch, cache in `FxRate`, convert. |
| `src/lib/audit.ts` | `recordAudit({ actor, action, target, before, after })`. |
| `src/lib/validation.ts` | Zod schemas — shared between API & client. |
| `src/app/api/*` | Route handlers — thin; delegate to `lib/*`. |
| `src/app/(app)/*` | Authenticated pages. RSC by default, client islands for interactivity. |
| `scripts/backup.ts` | Nightly `pg_dump` + encrypt + upload to R2. |
| `scripts/snapshot-cron.ts` | Monthly net-worth snapshot job. |
| `ios/FinanceApp/*` | SwiftUI app — same API. |

## Threat model (abridged)

| Threat | Mitigation |
|---|---|
| Stolen DB backup | Backups are AES-256-GCM encrypted with the KEK before leaving the host. |
| Stolen R2 object | Statement images are envelope-encrypted; the bucket alone is useless. |
| Stolen session token | Sessions are DB-backed and revocable. 30-day idle expiry. |
| Phishing | Passkeys are phishing-resistant. Magic links are domain-bound. |
| Prompt injection in OCR | OCR output is strictly schema-validated (Zod); nothing from the model becomes code, only data, and the user reviews before save. |
| Mass enumeration | Auth & mutation endpoints rate-limited per session+IP (10 r/s burst). |
| Lost master KEK | Documented recovery: re-encrypt from CSV/JSON export. KEK lives in two places (Vercel env + offline copy). |
