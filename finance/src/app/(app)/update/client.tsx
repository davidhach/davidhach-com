"use client";
import { useState, useRef } from "react";
import { Card, Button, Input, Label } from "@/components/ui/primitives";

interface AssetRow {
  id: string;
  name: string;
  entity: string;
  assetClass: string;
  currency: string;
  currentValue: string;
}

export function BulkUpdateClient({ assets }: { assets: AssetRow[] }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const order = assets.map((a) => a.id);
  const dirty = order.filter((id) => values[id] && values[id].trim() !== "");

  function setVal(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const idx = order.indexOf(id);
    const next = order[idx + 1];
    if (next) inputsRef.current[next]?.focus();
    else void submit();
  }

  async function submit() {
    if (dirty.length === 0) return;
    setBusy(true);
    setMsg(null);
    const entries = dirty.map((id) => {
      const a = assets.find((x) => x.id === id)!;
      return { assetId: id, value: values[id].trim(), currency: a.currency };
    });
    const res = await fetch("/api/valuations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, entries }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ tone: "ok", text: `Saved ${data.inserted} valuation${data.inserted === 1 ? "" : "s"} for ${data.date}.` });
      setValues({});
    } else {
      setMsg({ tone: "err", text: data.error ?? "Save failed" });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <Label htmlFor="bulk-date">Snapshot date</Label>
          <Input id="bulk-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)} className="max-w-[180px]" />
        </div>
        <div className="text-xs text-muted">
          {dirty.length} of {assets.length} ready · Enter moves to next, Enter on last saves
        </div>
      </div>

      <ul className="divide-y divide-border">
        {assets.map((a) => (
          <li key={a.id} className="py-2.5 grid grid-cols-[1fr_140px_160px] items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm truncate">{a.name}</div>
              <div className="text-xs text-muted">{a.entity} · {a.assetClass.toLowerCase().replace(/_/g, " ")} · {a.currency}</div>
            </div>
            <div className="text-xs text-muted text-right tnum">Current: {a.currentValue}</div>
            <Input
              ref={(el) => { inputsRef.current[a.id] = el; }}
              inputMode="decimal"
              placeholder="New value"
              value={values[a.id] ?? ""}
              onChange={(e) => setVal(a.id, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, a.id)}
              className="text-right tnum"
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between mt-4">
        <div className="text-xs">
          {msg && (
            <span className={msg.tone === "ok" ? "text-positive" : "text-negative"}>{msg.text}</span>
          )}
        </div>
        <Button onClick={submit} disabled={busy || dirty.length === 0}>
          {busy ? "Saving…" : `Save ${dirty.length || ""}`.trim()}
        </Button>
      </div>
    </Card>
  );
}
