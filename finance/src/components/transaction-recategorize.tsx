"use client";
import { useState } from "react";

interface Category { id: string; name: string; kind: "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY" }

interface Props {
  txId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  merchantNormalized: string | null;
  categories: Category[];
  isIncome: boolean; // sign of the txn amount, drives which categories we suggest first
}

/**
 * Inline category picker for one transaction. On change:
 *   1. PATCH the transaction's categoryId.
 *   2. Offer to create a CategoryRule so future txns from the same merchant
 *      get the new category automatically.
 */
export function TransactionRecategorize({
  txId, currentCategoryId, currentCategoryName, merchantNormalized, categories, isIncome,
}: Props) {
  const relevant = categories.filter((c) =>
    isIncome ? c.kind === "INCOME" : c.kind === "EXPENSE",
  );
  const [value, setValue] = useState(currentCategoryId ?? "");
  const [state, setState] = useState<"idle" | "saving" | "ask-rule" | "saved" | "error">("idle");
  const [backfilled, setBackfilled] = useState<number | null>(null);

  async function pick(nextId: string) {
    setValue(nextId);
    setState("saving");
    const res = await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: nextId || null }),
    });
    if (!res.ok) { setState("error"); return; }
    setState(merchantNormalized ? "ask-rule" : "saved");
  }

  async function createRule(backfill: boolean) {
    if (!merchantNormalized) return;
    setState("saving");
    const res = await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchType: "MERCHANT_EXACT",
        pattern: merchantNormalized,
        categoryId: value,
        backfill,
        onlyUncategorized: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setBackfilled(data.backfilled ?? 0); setState("saved"); }
    else        { setState("error"); }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <select value={value} onChange={(e) => pick(e.target.value)}
        className="bg-card border border-border rounded-md px-2 py-1 max-w-[160px]">
        <option value="">Uncategorized</option>
        {relevant.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {state === "saving" && <span className="text-muted">…</span>}
      {state === "ask-rule" && (
        <span className="flex items-center gap-1">
          <span className="text-muted">Apply to other "{merchantNormalized}"?</span>
          <button type="button" onClick={() => createRule(true)} className="underline">Yes</button>
          <button type="button" onClick={() => setState("saved")} className="underline text-muted">No</button>
        </span>
      )}
      {state === "saved" && backfilled !== null && (
        <span className="text-positive">Rule saved · {backfilled} updated</span>
      )}
      {state === "saved" && backfilled === null && currentCategoryName !== null && (
        <span className="text-positive">Saved</span>
      )}
      {state === "error" && <span className="text-negative">Failed</span>}
    </div>
  );
}
