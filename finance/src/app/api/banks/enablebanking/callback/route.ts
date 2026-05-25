/**
 * GET /api/banks/enablebanking/callback?code=…&state=<connectionId>
 *
 * Where the bank's consent UI redirects after approval/decline. We:
 *   1. Verify state matches a connection the caller owns.
 *   2. Exchange the code for a session via Enable Banking (read-only).
 *   3. Store the session id on the connection (in requisitionId, the existing
 *      column we reuse for both providers' session/requisition handle).
 *   4. Redirect to the account-linking UI.
 *
 * The status stays PENDING until the user picks which detected accounts to
 * link to which FinAccount on the next page.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/bank/enablebanking/client";
import { recordAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (!state) return NextResponse.redirect(new URL("/settings/banks?error=missing-state", req.url));

  const conn = await prisma.bankConnection.findFirst({
    where: { id: state, userId: session.user.id, provider: "enablebanking" },
  });
  if (!conn) return NextResponse.redirect(new URL("/settings/banks?error=not-found", req.url));

  if (error || !code) {
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: error ?? "No code returned" },
    });
    return NextResponse.redirect(new URL("/settings/banks?error=denied", req.url));
  }

  try {
    const ebSession = await createSession(code);
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { requisitionId: ebSession.session_id, lastError: null },
    });
    await recordAudit({
      userId: session.user.id, action: "bank.enablebanking.callback.ok",
      targetType: "BankConnection", targetId: conn.id,
      after: { session_id: ebSession.session_id, accounts: ebSession.accounts?.length ?? 0 },
    });
    return NextResponse.redirect(new URL(`/settings/banks/${conn.id}/link`, req.url));
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: msg },
    });
    return NextResponse.redirect(new URL("/settings/banks?error=session-failed", req.url));
  }
}
