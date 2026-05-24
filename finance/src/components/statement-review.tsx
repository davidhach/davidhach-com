"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

interface Tx {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: string;
  currency: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  confidence: number | null;
  duplicateOfId: string | null;
  finAccountId: string;
}

interface Props {
  statementId: string;
  warnings: string[];
  overallConfidence: number | null;
  initialTransactions: Tx[];
}

export function StatementReview({ statementId, warnings, overallConfidence, initialTransactions }: Props) {
  const router = useRouter();
  const [txs, setTxs] = useState(initialTransactions);
  const [kept, setKept] = useState<Set<string>>(new Set(initialTransactions.filter((t) => !t.duplicateOfId).map((t) => t.id)));
  const [edits, setEdits] = useState<Record<string, Partial<Tx>>>({});
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => {
    let spending = 0, income = 0;
    for (const t of txs) {
      if (!kept.has(t.id)) continue;
      const amt = parseFloat((edits[t.id]?.amount as string | undefined) ?? t.amount);
      if (amt < 0) spending += -amt; else income += amt;
    }
    return { spending, income };
  }, [txs, kept, edits]);

  function toggle(id: string) {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function patch(id: string, field: keyof Tx, value: unknown) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } as Tx : t)));
  }

  async function save() {
    setSaving(true);
    const keep = [...kept];
    const reject = txs.map((t) => t.id).filter((id) => !kept.has(id));
    const res = await fetch(`/api/statements/${statementId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keep, reject, edits }),
    });
    setSaving(false);
    if (res.ok) router.push("/spending");
    else alert("Save failed");
  }

  return (
    <div className="space-y-4">
      {(warnings?.length || overallConfidence) && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <p className="text-xs font-medium text-muted mb-2">
            Model confidence: {overallConfidence ? `${Math.round(overallConfidence * 100)}%` : "—"}
          </p>
          {warnings?.length > 0 && (
            <ul className="text-xs text-muted space-y-1 list-disc list-inside">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {kept.size} of {txs.length} selected · spending {formatMoney(total.spending, txs[0]?.currency ?? "USD")} · income {formatMoney(total.income, txs[0]?.currency ?? "USD")}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setKept(new Set())}>Deselect all</Button>
          <Button variant="secondary" onClick={() => setKept(new Set(txs.map((t) => t.id)))}>Select all</Button>
          <Button onClick={save} disabled={saving || kept.size === 0}>{saving ? "Saving…" : `Save ${kept.size}`}</Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 text-xs text-muted">
            <tr>
              <th className="w-8 px-3 py-2.5"></th>
              <th className="text-left font-medium px-3 py-2.5">Date</th>
              <th className="text-left font-medium px-3 py-2.5">Description</th>
              <th className="text-left font-medium px-3 py-2.5">Merchant</th>
              <th className="text-left font-medium px-3 py-2.5">Category</th>
              <th className="text-right font-medium px-3 py-2.5">Amount</th>
              <th className="text-right font-medium px-3 py-2.5 w-16">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {txs.map((t) => {
              const isKept = kept.has(t.id);
              const isDupe = !!t.duplicateOfId;
              const amount = parseFloat(t.amount);
              return (
                <tr key={t.id} className={isKept ? "" : "opacity-40"}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={isKept} onChange={() => toggle(t.id)} className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={t.date}
                      onChange={(e) => patch(t.id, "date", e.target.value)}
                      className="!py-1 text-xs w-28 tnum"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={t.description}
                      onChange={(e) => patch(t.id, "description", e.target.value)}
                      className="!py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={t.merchant ?? ""}
                      onChange={(e) => patch(t.id, "merchant", e.target.value)}
                      className="!py-1 text-xs"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.category?.name ?? <span className="text-muted">Uncategorized</span>}
                    {isDupe && <Badge tone="warning" className="ml-2">duplicate?</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      value={t.amount}
                      onChange={(e) => patch(t.id, "amount", e.target.value)}
                      className={`!py-1 text-xs tnum w-24 text-right ${amount < 0 ? "" : "text-positive"}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted tnum">
                    {t.confidence != null ? `${Math.round(t.confidence * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
