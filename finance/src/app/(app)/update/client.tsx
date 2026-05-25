"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select } from "@/components/ui/primitives";

interface AssetRow {
  id: string;
  name: string;
  entity: string;
  assetClass: string;
  currency: string;
  currentValue: string;
  quantity: string | null;
  priceSource: string | null;
  externalRef: string | null;
  isPriced: boolean;       // adapter-priced + has externalRef
}

interface FinAccount { id: string; name: string; currency: string }

interface PricedDraft { kind: "BUY" | "SELL"; quantity: string; pricePerUnit: string; finAccountId: string }

/**
 * Two-mode bulk update:
 *   - Manual rows: type a new currentValue → POSTs to /api/valuations/bulk.
 *   - Priced rows: pick BUY/SELL + quantity + price/unit → POSTs an AssetTransaction
 *     per row to /api/assets/[id]/transactions. Optionally writes the cash leg
 *     against a chosen FinAccount.
 */
export function BulkUpdateClient({ assets, finAccounts }: { assets: AssetRow[]; finAccounts: FinAccount[] }) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [priced, setPriced] = useState<Record<string, PricedDraft>>({});
  const [recordCashLeg, setRecordCashLeg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const manualAssets = assets.filter((a) => !a.isPriced);
  const pricedAssets = assets.filter((a) => a.isPriced);

  const dirtyManual = manualAssets.filter((a) => manualValues[a.id]?.trim());
  const dirtyPriced = pricedAssets.filter((a) => priced[a.id]?.quantity && priced[a.id]?.pricePerUnit);

  function getPriced(id: string, ccy: string): PricedDraft {
    return priced[id] ?? { kind: "BUY", quantity: "", pricePerUnit: "", finAccountId: "" };
  }
  function setPricedDraft(id: string, patch: Partial<PricedDraft>, ccy: string) {
    setPriced((p) => ({ ...p, [id]: { ...getPriced(id, ccy), ...patch } }));
  }

  async function submit() {
    if (dirtyManual.length === 0 && dirtyPriced.length === 0) return;
    setBusy(true); setMsg(null);

    let manualInserted = 0;
    let buysSells = 0;
    let errors = 0;

    if (dirtyManual.length > 0) {
      const entries = dirtyManual.map((a) => ({
        assetId: a.id, value: manualValues[a.id].trim(), currency: a.currency,
      }));
      const res = await fetch("/api/valuations/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, entries }),
      });
      if (res.ok) {
        const data = await res.json();
        manualInserted = data.inserted ?? 0;
      } else errors++;
    }

    for (const a of dirtyPriced) {
      const d = priced[a.id];
      const res = await fetch(`/api/assets/${a.id}/transactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: d.kind,
          date,
          quantity: d.quantity.trim(),
          pricePerUnit: d.pricePerUnit.trim(),
          currency: a.currency,
          finAccountId: d.finAccountId || undefined,
          recordCashLeg: recordCashLeg && !!d.finAccountId,
        }),
      });
      if (res.ok) buysSells++; else errors++;
    }

    setBusy(false);
    if (errors > 0) {
      setMsg({ tone: "err", text: `${errors} row(s) failed. Manual saves: ${manualInserted}, trades: ${buysSells}.` });
    } else {
      setMsg({ tone: "ok", text: `Saved · ${manualInserted} valuation(s) · ${buysSells} trade(s) on ${date}.` });
      setManualValues({}); setPriced({});
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label htmlFor="bulk-date">Effective date</Label>
            <Input id="bulk-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)} className="max-w-[180px]" />
          </div>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={recordCashLeg} onChange={(e) => setRecordCashLeg(e.target.checked)} />
            Also record the matching cash leg in the chosen account (for trades)
          </label>
        </div>
      </Card>

      {pricedAssets.length > 0 && (
        <Card>
          <h2 className="font-medium text-sm mb-3">Auto-priced positions (BUY / SELL)</h2>
          <ul className="divide-y divide-border">
            {pricedAssets.map((a) => {
              const d = getPriced(a.id, a.currency);
              return (
                <li key={a.id} className="py-3 grid grid-cols-1 md:grid-cols-[1fr_110px_120px_150px_180px] gap-2 items-end">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{a.name}</div>
                    <div className="text-xs text-muted">
                      {a.entity} · {a.assetClass.toLowerCase()} · qty {a.quantity ?? "0"} · {a.currency} · {a.priceSource}:{a.externalRef}
                    </div>
                  </div>
                  <Select value={d.kind} onChange={(e) => setPricedDraft(a.id, { kind: e.target.value as "BUY" | "SELL" }, a.currency)}>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </Select>
                  <Input inputMode="decimal" placeholder="Quantity"
                    value={d.quantity}
                    onChange={(e) => setPricedDraft(a.id, { quantity: e.target.value }, a.currency)} />
                  <Input inputMode="decimal" placeholder={`Price/unit ${a.currency}`}
                    value={d.pricePerUnit}
                    onChange={(e) => setPricedDraft(a.id, { pricePerUnit: e.target.value }, a.currency)} />
                  <Select value={d.finAccountId}
                    onChange={(e) => setPricedDraft(a.id, { finAccountId: e.target.value }, a.currency)}>
                    <option value="">Cash account (optional)</option>
                    {finAccounts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {manualAssets.length > 0 && (
        <Card>
          <h2 className="font-medium text-sm mb-3">Manual values</h2>
          <ul className="divide-y divide-border">
            {manualAssets.map((a) => (
              <li key={a.id} className="py-2.5 grid grid-cols-[1fr_140px_160px] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{a.name}</div>
                  <div className="text-xs text-muted">{a.entity} · {a.assetClass.toLowerCase()} · {a.currency}</div>
                </div>
                <div className="text-xs text-muted text-right tnum">Current: {a.currentValue}</div>
                <Input inputMode="decimal" placeholder="New value"
                  value={manualValues[a.id] ?? ""}
                  onChange={(e) => setManualValues((p) => ({ ...p, [a.id]: e.target.value }))}
                  className="text-right tnum" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {assets.length === 0 && (
        <Card className="text-center py-10">
          <p className="text-sm text-muted">No assets yet. Add one to start tracking.</p>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs">
          {msg && <span className={msg.tone === "ok" ? "text-positive" : "text-negative"}>{msg.text}</span>}
        </div>
        <Button onClick={submit} disabled={busy || (dirtyManual.length === 0 && dirtyPriced.length === 0)}>
          {busy ? "Saving…" : `Save ${dirtyManual.length + dirtyPriced.length || ""}`.trim()}
        </Button>
      </div>
    </div>
  );
}
