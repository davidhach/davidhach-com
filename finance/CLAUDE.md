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
  build pass but the deployment fail *after* build. (Monthly snapshot currently piggybacks
  on the daily fx cron — runs when UTC day-of-month == 1.)
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
