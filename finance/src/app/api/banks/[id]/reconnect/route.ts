/**
 * POST /api/banks/[id]/reconnect
 *
 * Restarts the Enable Banking consent for the SAME institution as an existing
 * connection. Creates a NEW BankConnection row + new auth session and returns
 * its consent URL. The OLD failing connection is kept (untouched) — the user
 * disconnects it manually once the new one is linked.
 *
 * Used by the connection-health banner's "Reconnect at bank" button.
 * Only works for Enable Banking connections; bare crypto / CSV connections
 * don't have a consent to refresh.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/require-auth";
import { startAuth, isConfigured } from "@/lib/bank/enablebanking/client";
import { recordAudit } from "@/lib/audit";

function lastConnectionId(pathname: string): string {
  // .../api/banks/<id>/reconnect → take the segment before "reconnect"
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

function redirectUrl(): string {
  const base =
    process.env.ENABLE_BANKING_REDIRECT_URL ??
    (() => {
      const root = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
      if (!root) throw new Error("Set ENABLE_BANKING_REDIRECT_URL or AUTH_URL");
      return new URL("/api/banks/enablebanking/callback", root).toString();
    })();
  return base;
}

function futureConsent(days = 180): Date {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export const POST = withAuth(async (userId, req) => {
  const oldId = lastConnectionId(new URL(req.url).pathname);
  const old = await prisma.bankConnection.findFirst({ where: { id: oldId, userId } });
  if (!old) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  if (old.provider !== "enablebanking") {
    return NextResponse.json(
      { error: `${old.provider} connections don't use bank-side consent — use Retry sync instead.` },
      { status: 400 },
    );
  }
  if (!old.institutionId || !old.institutionName) {
    return NextResponse.json({ error: "Original institution metadata missing — please add a fresh connection instead." }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Enable Banking is not configured." }, { status: 503 });
  }

  // Enable Banking institution ids are formatted "<COUNTRY>:<NAME>" by our
  // start route. Recover both parts.
  const [country, ...rest] = old.institutionId.split(":");
  const aspspName = rest.join(":") || old.institutionName;
  if (!/^[A-Z]{2}$/.test(country ?? "")) {
    return NextResponse.json({ error: "Couldn't infer the bank's country from the stored connection." }, { status: 400 });
  }

  // Pre-create the new connection so we can pass its id as the state.
  const fresh = await prisma.bankConnection.create({
    data: {
      userId,
      provider: "enablebanking",
      institutionId: old.institutionId,
      institutionName: old.institutionName,
      status: "PENDING",
    },
  });

  try {
    const auth = await startAuth({
      aspspName, aspspCountry: country, redirectUrl: redirectUrl(), state: fresh.id,
    });
    await prisma.bankConnection.update({
      where: { id: fresh.id },
      data: { consentExpiresAt: futureConsent(), lastError: null },
    });
    await recordAudit({
      userId, action: "bank.reconnect", targetType: "BankConnection", targetId: fresh.id,
      after: { previousConnectionId: old.id, aspspName }, req,
    });
    return NextResponse.json({ connectionId: fresh.id, redirectUrl: auth.url });
  } catch (e) {
    await prisma.bankConnection.update({
      where: { id: fresh.id },
      data: { status: "ERROR", lastError: (e as Error).message },
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
