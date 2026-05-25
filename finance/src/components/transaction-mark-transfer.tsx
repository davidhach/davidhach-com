"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-click "this is a transfer to/from my own account" button. Creates a
 * TransferRule so all current + future matching transactions are excluded
 * from spending/income totals.
 */
export function TransactionMarkTransfer({
  txId, merchantNormalized,
}: { txId: string; merchantNormalized: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [info, setInfo] = useState<string | null>(null);

  async function mark() {
    setState("saving"); setInfo(null);
    const res = await fetch("/api/transfers/mark-own", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: txId, alsoCreateRule: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const back = data.rule?.backfilled ?? 0;
      setInfo(back > 1 ? `Marked · ${back} similar excluded` : "Marked");
      setState("saved");
      router.refresh();
    } else {
      setInfo(data.error ?? "Failed");
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button type="button" onClick={mark} disabled={state === "saving"}
        title={merchantNormalized
          ? `Mark as a transfer to/from my own account. Creates a rule for "${merchantNormalized}".`
          : "Mark as a transfer to/from my own account."}
        className="text-muted hover:text-fg underline disabled:opacity-50">
        {state === "saving" ? "…" : "↔ own account"}
      </button>
      {info && <span className={state === "error" ? "text-negative" : "text-positive"}>{info}</span>}
    </span>
  );
}
