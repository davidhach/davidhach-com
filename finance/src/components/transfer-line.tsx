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
  /** True when transferPairId is set (two-sided pair). Drives which API endpoint to call. */
  paired: boolean;
}

/** One row in the "Transfers / card payments" list, with an Unpair / Restore action.
 *  Two-sided pairs call /api/transfers/unpair; one-sided rule-marked rows call
 *  /api/transfers/unmark. Either way the transaction goes back into totals. */
export function TransferLine({ id, date, accountName, description, amountDisplay, kindLabel, paired }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function restore() {
    if (!confirm("Treat this as regular spending/income instead of a transfer?")) return;
    setBusy(true);
    const url = paired ? "/api/transfers/unpair" : "/api/transfers/unmark";
    const res = await fetch(url, {
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
      <button type="button" onClick={restore} disabled={busy}
        className="text-xs px-2 py-1 rounded-md text-muted hover:bg-bg hover:text-fg disabled:opacity-50"
        title={paired ? "Detach the pair and count both sides again" : "Count this transaction as spending/income again"}>
        {busy ? "…" : paired ? "Unpair" : "Not a transfer"}
      </button>
    </li>
  );
}
