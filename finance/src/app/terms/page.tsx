import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service — Ledger",
  description: "Terms of use for the Ledger personal-finance tracker.",
};

const UPDATED = "2026-05-27";
const CONTACT = "davidhach0@gmail.com";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated={UPDATED}>
      <p>
        Ledger is a personal-finance tracker provided as-is by the individual reachable
        at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. By using the service you accept
        the terms below.
      </p>

      <h2>What Ledger is</h2>
      <p>
        Ledger is a private, single-user net-worth and spending tracker. It is not a bank,
        a payment institution, a broker, or a financial advisor. Nothing in the app
        constitutes financial, tax, or investment advice. Values shown can be incorrect
        (market data lags, FX rates round, CSV parsers can mis-categorise) — always
        verify against your bank and broker before making decisions.
      </p>

      <h2>What Ledger does not do</h2>
      <ul>
        <li>It cannot send money, initiate payments, or make trades on your behalf.</li>
        <li>
          Bank access is strictly <strong>read-only</strong> via the regulated PSD2
          Account Information Service (Enable Banking acts as the AISP). The integration
          has no payment-initiation endpoints.
        </li>
        <li>It does not give investment recommendations.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your password and TOTP secret to yourself.</li>
        <li>Don&apos;t share your account with others — Ledger is single-user by design.</li>
        <li>
          Use the read-only bank consent only for accounts you own or are authorised to
          view. Don&apos;t paste anyone else&apos;s crypto private keys, seed phrases, or
          third-party credentials.
        </li>
        <li>Don&apos;t attempt to disrupt the service or reverse the encryption.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        The service is provided on a best-effort basis. There is no SLA. The operator may
        change features, pause sync, or take the service down for maintenance with
        reasonable notice. Your data export is always available so you can move off at
        any time.
      </p>

      <h2>Pricing</h2>
      <p>
        Ledger is currently free for personal use. If pricing changes you&apos;ll be
        notified before any charge applies.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, the operator is not liable for indirect or
        consequential losses arising from use of the service, including missed trades,
        tax errors, or financial decisions based on the values displayed. Always
        reconcile against authoritative sources (your bank, broker, custodian).
      </p>

      <h2>Account termination</h2>
      <p>
        You may delete your account at any time by email to{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. The operator may terminate accounts
        that violate these terms (e.g. unauthorised access attempts, abuse).
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of Germany. Any dispute is subject to the
        competent courts of the operator&apos;s place of residence.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may be updated. Material changes will be announced in the app or by
        email. Continued use after a change means acceptance.
      </p>

      <p className="text-xs text-muted mt-8">
        Last updated {UPDATED}. See also <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </LegalShell>
  );
}
