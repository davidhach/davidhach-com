/**
 * GET /api/banks/gocardless/callback?ref=<connectionId>
 *
 * Where the bank's hosted consent UI redirects the user back to once they've
 * approved (or declined) the requisition. GoCardless echoes our `reference`
 * back as `ref`. We look up the connection, verify ownership, and bounce the
 * user to /settings/banks/[id]/link where they pick which detected accounts
 * to map to which FinAccount.
 *
 * Sets status = PENDING (still — actual ACTIVE happens after linking).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref) return NextResponse.redirect(new URL("/settings/banks?error=missing-ref", req.url));

  const conn = await prisma.bankConnection.findFirst({
    where: { id: ref, userId: session.user.id },
    select: { id: true },
  });
  if (!conn) return NextResponse.redirect(new URL("/settings/banks?error=not-found", req.url));

  return NextResponse.redirect(new URL(`/settings/banks/${conn.id}/link`, req.url));
}
