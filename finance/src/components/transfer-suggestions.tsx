"use client";
import { useEffect, useState } from "react";
import { Button, Badge } from "@/components/ui/primitives";

interface Suggestion {
  outflowId: string;
  inflowId: string;
  date: string;
  amount: string;
  currency: string;
  outflowAccount: string;
  inflowAccount: string;
  outflowDesc: string;
  inflowDesc: string;
  kind: "TRANSFER" | "CARD_PAYMENT";
  confidence: number;
}

/**
 * Detected internal transfers and card-settlement pairs. Same pattern as the
 * suggested-trades panel: user confirms each row, never auto-applied.
 */
export function TransferSuggestions() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transfers/suggestions")
      .then((r) => r.ok ? r.json() : { suggestions: [] })
      .then((d) => setItems(d.suggestions ?? []))
      .catch(() => setItems([]));
  }, []);

  async function confirm(s: Suggestion) {
    setBusy(s.outflowId);
    const res = await fetch("/api/transfers/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outflowId: s.outflowId, inflowId: s.inflowId, kind: s.kind }),
    });
    setBusy(null);
    if (res.ok) setItems((prev) => prev?.filter((x) => x.outflowId !== s.outflowId) ?? null);
  }

  async function dismiss(s: Suggestion) {
    // Local-only dismiss — no DB row yet. Re-shows on next reload until confirmed.
    setItems((prev) => prev?.filter((x) => x.outflowId !== s.outflowId) ?? null);
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">
          Possible {items.length === 1 ? "transfer" : "transfers"} / card settlements
        </h2>
        <Badge tone="warning">{items.length}</Badge>
      </div>
      <p className="text-xs text-muted">
        These look like money moving between your own accounts. Confirm to exclude them from
        spending + income totals (the individual purchases on the receiving card still count).
      </p>
      <ul className="divide-y divide-border bg-card rounded-lg border border-border">
        {items.slice(0, 10).map((s) => (
          <li key={`${s.outflowId}-${s.inflowId}`} className="p-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
            <div className="min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.amount} {s.currency}</span>
                <Badge>{s.kind.replace("_", " ").toLowerCase()}</Badge>
                <span className="text-xs text-muted">{s.date}</span>
              </div>
              <div className="text-xs text-muted mt-0.5 truncate">
                <span className="text-negative">−</span> {s.outflowAccount}: {s.outflowDesc}
              </div>
              <div className="text-xs text-muted truncate">
                <span className="text-positive">+</span> {s.inflowAccount}: {s.inflowDesc}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => dismiss(s)} disabled={busy !== null}>Not a transfer</Button>
              <Button onClick={() => confirm(s)} disabled={busy !== null}>
                {busy === s.outflowId ? "…" : "Confirm"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
