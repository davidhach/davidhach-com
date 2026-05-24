import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";

/**
 * Auth.js v5 — passwordless email magic links.
 *
 * The Auth.js database session is the single source of truth; every page under
 * (app)/ and every /api data route checks it via auth() / requireUserId().
 * (Passkeys can be layered on later via SimpleWebAuthn — not wired up yet.)
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER ?? "smtp://localhost:1025",
      from: process.env.EMAIL_FROM ?? "Ledger <no-reply@ledger.local>",
      // In dev (no SMTP configured), print the magic link to the server
      // terminal instead of trying to send mail. Click it from your console.
      sendVerificationRequest: process.env.EMAIL_SERVER
        ? undefined
        : async ({ identifier, url }) => {
            console.log("\n──────────────────────────────────────────────");
            console.log(`Magic sign-in link for ${identifier}:`);
            console.log(url);
            console.log("──────────────────────────────────────────────\n");
          },
    }),
  ],
  pages: { signIn: "/login", verifyRequest: "/verify" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  trustHost: true,
});

/** Server helper: throw if not authenticated. Use in API routes & server pages. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    const err = new Error("Unauthorized");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return session.user.id;
}

declare module "next-auth" {
  interface Session {
    user: { id: string; email?: string | null; name?: string | null; image?: string | null };
  }
}
