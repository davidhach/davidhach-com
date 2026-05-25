"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui/primitives";

type Mode = "pick" | "gocardless" | "btc" | "eth" | "csv";

interface FinAccount { id: string; name: string; currency: string; kind: string }
interface Institution { id: string; name: string; bic: string | null; transactionDays: string | null }

export function NewBankClient({ finAccounts }: { finAccounts: FinAccount[] }) {
  const [mode, setMode] = useState<Mode>("pick");

  if (finAccounts.length === 0) {
    return <p className="text-sm text-muted">
      Create a financial account first (e.g. a checking account) under <a className="underline" href="/accounts">Accounts</a>.
      Connections link to one of your accounts.
    </p>;
  }

  if (mode === "pick") return <ProviderPicker onPick={setMode} />;
  if (mode === "gocardless") return <GoCardlessFlow onBack={() => setMode("pick")} />;
  if (mode === "btc" || mode === "eth") {
    return <CryptoForm provider={mode === "btc" ? "btc_address" : "eth_address"}
      finAccounts={finAccounts} onBack={() => setMode("pick")} />;
  }
  return <CsvFlow finAccounts={finAccounts} onBack={() => setMode("pick")} />;
}

function ProviderPicker({ onPick }: { onPick: (m: Mode) => void }) {
  const items: Array<{ id: Mode; title: string; desc: string }> = [
    { id: "gocardless", title: "EU bank (Sparkasse, Consors, N26, …)",
      desc: "Connect via GoCardless Bank Account Data. Read-only PSD2 / open-banking access, free tier. 90-day re-consent." },
    { id: "btc", title: "Bitcoin address",
      desc: "Track a public BTC address's balance via mempool.space. No private keys, no transactions written." },
    { id: "eth", title: "Ethereum address",
      desc: "Track a public ETH address's balance via a public RPC. Read-only." },
    { id: "csv", title: "Upload CSV statement",
      desc: "Import transactions from a bank-exported CSV. Works as a universal fallback." },
  ];
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onPick(i.id)}
            className="w-full text-left border border-border rounded-xl px-4 py-3 hover:bg-bg transition">
            <div className="font-medium text-sm">{i.title}</div>
            <div className="text-xs text-muted mt-0.5">{i.desc}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GoCardlessFlow({ onBack }: { onBack: () => void }) {
  const [country, setCountry] = useState("DE");
  const [filter, setFilter] = useState("");
  const [list, setList] = useState<Institution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/banks/gocardless/institutions?country=${country}`)
      .then(async (r) => r.ok ? r.json() : Promise.reject((await r.json()).error))
      .then(setList)
      .catch((e) => setError(typeof e === "string" ? e : "Failed"))
      .finally(() => setLoading(false));
  }, [country]);

  async function start(inst: Institution) {
    setStarting(inst.id); setError(null);
    const res = await fetch("/api/banks/gocardless/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId: inst.id, institutionName: inst.name }),
    });
    const data = await res.json();
    setStarting(null);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    window.location.href = data.redirectUrl;
  }

  const filtered = list?.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {["DE", "AT", "CH", "FR", "IT", "ES", "NL", "BE", "IE", "GB"].map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <Label>Search</Label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Sparkasse, Consors, N26…" />
        </div>
      </div>
      {loading && <p className="text-xs text-muted">Loading banks…</p>}
      {error && <p className="text-xs text-negative">{error}</p>}
      {list && (
        <ul className="divide-y divide-border max-h-96 overflow-auto border border-border rounded-xl">
          {filtered.slice(0, 50).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm truncate">{i.name}</div>
                <div className="text-xs text-muted truncate">{i.bic ?? i.id}</div>
              </div>
              <Button variant="secondary" onClick={() => start(i)} disabled={starting === i.id}>
                {starting === i.id ? "…" : "Connect"}
              </Button>
            </li>
          ))}
          {filtered.length === 0 && <li className="p-3 text-xs text-muted">No matches.</li>}
        </ul>
      )}
    </div>
  );
}

function CryptoForm({ provider, finAccounts, onBack }: {
  provider: "btc_address" | "eth_address"; finAccounts: FinAccount[]; onBack: () => void;
}) {
  const [address, setAddress] = useState("");
  const [finAccountId, setFinAccountId] = useState(finAccounts[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch("/api/banks/crypto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, address: address.trim(), finAccountId, label: label.trim() || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push("/settings/banks");
    else setError(data.error ?? "Failed");
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <div>
        <Label>{provider === "btc_address" ? "Bitcoin address (public)" : "Ethereum address (public)"}</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder={provider === "btc_address" ? "bc1q…" : "0x…"} autoFocus />
        <p className="text-xs text-muted mt-1">Public address only. Never paste a private key or seed phrase.</p>
      </div>
      <div>
        <Label>Map to financial account</Label>
        <Select value={finAccountId} onChange={(e) => setFinAccountId(e.target.value)}>
          {finAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Label (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cold wallet, Ledger Nano, …" />
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <Button onClick={save} disabled={busy || !address.trim() || !finAccountId}>
        {busy ? "Saving…" : "Save & fetch balance"}
      </Button>
    </div>
  );
}

interface ParsedRow { date: string; amount: string; currency: string; description: string; merchant?: string }

function CsvFlow({ finAccounts, onBack }: { finAccounts: FinAccount[]; onBack: () => void }) {
  const [finAccountId, setFinAccountId] = useState(finAccounts[0]?.id ?? "");
  const [currency, setCurrency] = useState(finAccounts[0]?.currency ?? "EUR");
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; warnings: string[]; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; duplicates: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("currency", currency);
    const res = await fetch("/api/banks/csv/preview", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setPreview({ rows: data.rows, warnings: data.warnings, fileName: data.fileName });
    else setError(data.error ?? "Parse failed");
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/banks/csv/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finAccountId, rows: preview.rows }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setResult({ inserted: data.inserted, duplicates: data.duplicates });
    else setError(data.error ?? "Commit failed");
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Financial account</Label>
          <Select value={finAccountId} onChange={(e) => {
            setFinAccountId(e.target.value);
            const a = finAccounts.find((x) => x.id === e.target.value);
            if (a) setCurrency(a.currency);
          }}>
            {finAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Default currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="uppercase" />
        </div>
      </div>
      <div>
        <Label>CSV file</Label>
        <input type="file" accept=".csv,text/csv" onChange={onFile}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-sm" />
        <p className="text-xs text-muted mt-1">Comma or semicolon. Headers auto-detected (German + English).</p>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      {busy && <p className="text-xs text-muted">Working…</p>}
      {preview && !result && (
        <div className="space-y-2">
          <p className="text-sm">{preview.rows.length} rows parsed from <strong>{preview.fileName}</strong>.</p>
          {preview.warnings.length > 0 && (
            <ul className="text-xs text-yellow-700 list-disc pl-4">
              {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <div className="border border-border rounded-xl max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-muted bg-bg sticky top-0">
                <tr><th className="text-left px-2 py-1.5">Date</th><th className="text-left px-2 py-1.5">Description</th><th className="text-right px-2 py-1.5">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 tnum">{r.date}</td>
                    <td className="px-2 py-1 truncate max-w-[280px]">{r.merchant ?? r.description}</td>
                    <td className={`px-2 py-1 text-right tnum ${r.amount.startsWith("-") ? "" : "text-positive"}`}>{r.amount} {r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 200 && <p className="text-xs text-muted p-2">…{preview.rows.length - 200} more (all will be imported).</p>}
          </div>
          <Button onClick={commit} disabled={busy}>
            {busy ? "Importing…" : `Import ${preview.rows.length} rows`}
          </Button>
        </div>
      )}
      {result && (
        <p className="text-sm text-positive">
          Imported {result.inserted} new transaction{result.inserted === 1 ? "" : "s"}.
          {result.duplicates > 0 && ` Skipped ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}.`}
        </p>
      )}
    </div>
  );
}
