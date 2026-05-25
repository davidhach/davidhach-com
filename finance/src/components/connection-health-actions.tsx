"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

/** Per-row actions on the connection-health banner: retry sync OR reconnect
 *  (restart Enable Banking consent for the same bank). */
export function ConnectionHealthActions({ id, canReconnect }: { id: string; canReconnect: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "reconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy("retry"); setError(null);
    const res = await fetch(`/api/banks/${id}/refresh`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && data.status !== "error") router.refresh();
    else setError(data.error ?? "Retry failed");
  }
  async function reconnect() {
    setBusy("reconnect"); setError(null);
    const res = await fetch(`/api/banks/${id}/reconnect`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && data.redirectUrl) {
      // Send the user to the bank's consent page. After they approve we land
      // on the callback and a NEW BankConnection is linked; the old failing
      // one stays until manually disconnected.
      window.location.href = data.redirectUrl;
    } else {
      setError(data.error ?? "Reconnect failed");
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error && <span className="text-xs text-negative max-w-[220px] truncate" title={error}>{error}</span>}
      <Button variant="secondary" onClick={retry} disabled={busy !== null}>
        {busy === "retry" ? "…" : "Retry sync"}
      </Button>
      {canReconnect && (
        <Button onClick={reconnect} disabled={busy !== null}>
          {busy === "reconnect" ? "…" : "Reconnect at bank"}
        </Button>
      )}
    </div>
  );
}
