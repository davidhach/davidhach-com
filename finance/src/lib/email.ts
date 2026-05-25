/**
 * Tiny transactional email helper, reusing the same EMAIL_SERVER + EMAIL_FROM
 * env vars that Auth.js's Nodemailer provider already uses (no extra Resend keys).
 *
 * In dev (no EMAIL_SERVER set) we log the message to the server console instead
 * of attempting to send — matches the magic-link fallback in src/lib/auth.ts.
 */
import nodemailer from "nodemailer";

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail({ to, subject, text, html }: SendArgs): Promise<void> {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM ?? "Ledger <no-reply@ledger.local>";

  if (!server) {
    console.log("\n──────────────────────────────────────────────");
    console.log(`Email to ${to}: ${subject}`);
    console.log(text);
    console.log("──────────────────────────────────────────────\n");
    return;
  }

  const transport = nodemailer.createTransport(server);
  await transport.sendMail({ from, to, subject, text, html });
}
