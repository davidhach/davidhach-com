import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";
import { SecurityClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      passwordHash: true,
      passwordChangedAt: true,
      totpEnabled: true,
      recoveryCodesHash: true,
    },
  });
  if (!user) return null;

  const remainingRecovery = user.recoveryCodesHash
    ? user.recoveryCodesHash.split("\n").filter(Boolean).length
    : 0;

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Password</h2>
          {user.passwordHash
            ? <Badge tone="positive">Set</Badge>
            : <Badge tone="warning">Not set</Badge>}
        </div>
        {user.passwordChangedAt && (
          <p className="text-xs text-muted mb-3">
            Last changed {user.passwordChangedAt.toISOString().slice(0, 10)}
          </p>
        )}
        <SecurityClient
          hasPassword={!!user.passwordHash}
          totpEnabled={user.totpEnabled}
          remainingRecovery={remainingRecovery}
        />
      </Card>

      <Card>
        <h2 className="font-medium text-sm mb-2">Account access</h2>
        <p className="text-xs text-muted">
          You can always sign in with an email magic link, even if you forget your password.
          On iPhone, the Ledger app uses Face ID to unlock the device-local session — it does
          not replace server-side credentials.
        </p>
      </Card>
    </div>
  );
}
