"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: string;
  date: string;
  accountName: string;
  description: string;
  amountDisplay: string;
  kindLabel: string;
}

/** One row in the "Transfers / card payments" list, with an Unpair action. */
export function TransferLine({ id, date, accountName, description, amountDisplay, kindLabel }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function unpair() {
    if (!confirm("Treat this as regular spending/income instead of a transfer?")) return;
    setBusy(true);
    const res = await fetch("/api/transfers/unpair", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }
  return (
    <li className="py-2 grid grid-cols-[1fr_auto_auto] gap-2 items-center text-sm">
      <div className="min-w-0">
        <div className="truncate">{description}</div>
        <div className="text-xs text-muted">{date} · {accountName} · {kindLabel}</div>
      </div>
      <div className="text-right tnum text-muted">{amountDisplay}</div>
      <button type="button" onClick={unpair} disabled={busy}
        className="text-xs px-2 py-1 rounded-md text-muted hover:bg-bg hover:text-fg disabled:opacity-50">
        {busy ? "…" : "Unpair"}
      </button>
    </li>
  );
}
