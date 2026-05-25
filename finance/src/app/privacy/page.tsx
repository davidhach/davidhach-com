import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Ledger",
  description: "How Ledger handles your data.",
};

const UPDATED = "2026-05-27";
const CONTACT = "davidhach0@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated={UPDATED}>
      <p>
        Ledger is a single-user personal finance and net-worth tracker built and operated
        by the individual reachable at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. This
        page describes what data Ledger holds about you and what it never does with it.
      </p>

      <h2>What data Ledger stores</h2>
      <ul>
        <li>
          <strong>Account profile:</strong> your email address (for sign-in) and your
          display preferences (currency, locale).
        </li>
        <li>
          <strong>Authentication:</strong> a password hash (argon2id) if you set one, an
          encrypted TOTP secret if you enable two-factor, and hashed one-time recovery
          codes. The plaintext password and recovery codes are never stored.
        </li>
        <li>
          <strong>Financial data you enter or import:</strong> entities, accounts, assets,
          liabilities, transactions, valuations, categories, tags, and any notes you add.
        </li>
        <li>
          <strong>Statement uploads:</strong> any bank-statement screenshots you upload
          are encrypted with AES-256-GCM (envelope encryption) before being stored in
          object storage. The encryption key never leaves the server environment.
        </li>
        <li>
          <strong>Bank-connection metadata:</strong> when you connect a bank via PSD2
          (Enable Banking), Ledger stores the consent session identifier and the list of
          accounts you chose to link. Access tokens are encrypted at rest.
        </li>
        <li>
          <strong>Audit log:</strong> a record of significant actions (login, asset
          create/update, connection start/sync) for security review. IP address and
          user-agent strings are kept with these entries.
        </li>
      </ul>

      <h2>How bank access works</h2>
      <p>
        Ledger uses the regulated <strong>PSD2 Account Information Service</strong> (AIS)
        scope only — Enable Banking acts as the regulated AISP. Ledger can <strong>read</strong>
        balances and transactions from the bank accounts you explicitly consent to. Ledger
        <strong> cannot initiate transfers, payments, or any write action</strong> on your
        bank account — the integration code has no payment endpoints and no write methods.
        Consent typically lasts 180 days; renewing it is your action at the bank.
      </p>

      <h2>Who sees your data</h2>
      <p>
        Your data is processed by:
      </p>
      <ul>
        <li><strong>Vercel</strong> (US/EU) — application hosting.</li>
        <li><strong>Neon</strong> (EU region available) — PostgreSQL database.</li>
        <li><strong>Cloudflare R2</strong> — encrypted statement-file storage.</li>
        <li><strong>Resend</strong> — outgoing email for sign-in links and password resets.</li>
        <li>
          <strong>Enable Banking</strong> (Finland) — regulated AISP used for read-only
          bank access. Only invoked when you choose to connect a bank.
        </li>
        <li>
          <strong>Anthropic</strong> — when you upload a statement screenshot, the image
          bytes are sent to Claude for OCR extraction. The model is not used to train on
          your data.
        </li>
        <li>
          <strong>Public market-data providers</strong> (OpenFIGI, Stooq, CoinGecko,
          mempool.space) — only for price lookups using public identifiers (ISIN, ticker,
          coin id, public crypto address). No personal data is sent to them.
        </li>
      </ul>
      <p>
        Ledger <strong>does not sell, share, or use your data for advertising</strong>.
        There is no analytics product or third-party tracker embedded in the application.
      </p>

      <h2>Where it lives</h2>
      <p>
        The database is hosted in the EU. Encrypted backups are written nightly to object
        storage. Statement files are stored encrypted at rest; without the server-side
        encryption key the files are useless.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export all your data as CSV/JSON at any time from the app, delete entities
        / accounts / connections individually, or request full account deletion by email.
        Account deletion is irreversible and removes all associated rows from the
        database and encrypted backups within 30 days.
      </p>

      <h2>Retention</h2>
      <p>
        Financial data is kept as long as your account exists, plus 30 days after account
        deletion (for backup rotation). The audit log is kept for the same period.
        Bank-connection access tokens are removed immediately on disconnect.
      </p>

      <h2>Cookies</h2>
      <p>
        Ledger uses a single first-party session cookie (HTTP-only, Secure) to keep you
        signed in. No analytics or advertising cookies are set.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or data requests:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <p className="text-xs text-muted mt-8">
        Last updated {UPDATED}. See also <Link href="/terms" className="underline">Terms of Service</Link>.
      </p>
    </LegalShell>
  );
}
