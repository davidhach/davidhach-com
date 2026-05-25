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

  return (
    <div className="flex items-center gap-2">
      {needsLinking && (
        <Link href={`/settings/banks/${id}/link`}>
          <Button variant="secondary">Finish setup</Button>
        </Link>
      )}
      {status === "ACTIVE" && (
        <Button variant="secondary" onClick={refresh} disabled={busy !== null}>
          {busy === "refresh" ? "…" : "Refresh"}
        </Button>
      )}
      <Button variant="destructive" onClick={disconnect} disabled={busy !== null}>
        {busy === "delete" ? "…" : "Disconnect"}
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
