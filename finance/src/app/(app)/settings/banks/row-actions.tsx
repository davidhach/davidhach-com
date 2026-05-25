"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";

export function BankRowActions({ id, status, needsLinking }: { id: string; status: string; needsLinking: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refresh" | "delete" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy("refresh"); setMsg(null);
    const res = await fetch(`/api/banks/${id}/refresh`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setMsg(`OK · ${data.balanceUpdates ?? 0} balance(s), ${data.transactionsInserted ?? 0} new tx`);
      router.refresh();
    } else {
      setMsg(data.error ?? "Refresh failed");
    }
  }
  async function disconnect() {
    if (!confirm("Disconnect this account? Historical transactions are kept.")) return;
    setBusy("delete"); setMsg(null);
    const res = await fetch(`/api/banks/${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else setMsg("Disconnect failed");
  }

  // Show the sync button for both ACTIVE (manual refresh) and ERROR /
  // CONSENT_EXPIRED (retry to clear the stale error). Previously the button
  // was hidden in the error states, leaving the user stuck with a permanently
  // red row even after the underlying problem (e.g. RPC outage) had cleared.
  const canSync = status === "ACTIVE" || status === "ERROR" || status === "CONSENT_EXPIRED";
  const syncLabel = status === "ACTIVE" ? "Refresh" : "Retry sync";

  return (
    <div className="flex items-center gap-2">
      {needsLinking && (
        <Link href={`/settings/banks/${id}/link`}>
          <Button variant="secondary">Finish setup</Button>
        </Link>
      )}
      {canSync && (
        <Button variant="secondary" onClick={refresh} disabled={busy !== null}>
          {busy === "refresh" ? "…" : syncLabel}
        </Button>
      )}
      <Button variant="destructive" onClick={disconnect} disabled={busy !== null}>
        {busy === "delete" ? "…" : "Disconnect"}
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
