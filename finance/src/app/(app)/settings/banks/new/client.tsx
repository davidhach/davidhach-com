"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui/primitives";

type Mode = "pick" | "enablebanking" | "btc" | "eth" | "csv" | "depot";

interface FinAccount { id: string; name: string; currency: string; kind: string; entityId: string }
interface Entity { id: string; name: string; currency: string }
interface Aspsp { name: string; country: string; logo: string | null; psuTypes: string[]; maxConsentDays: number | null }

interface Props {
  finAccounts: FinAccount[];
  entities: Entity[];
  preselectedAccountId: string | null;
  preselectedMode: string | null;
  enableBankingConfigured: boolean;
  enableBankingEnv: "sandbox" | "production";
}

const VALID_MODES: Mode[] = ["pick", "enablebanking", "btc", "eth", "csv", "depot"];

export function NewBankClient({ finAccounts, entities, preselectedAccountId, preselectedMode, enableBankingConfigured, enableBankingEnv }: Props) {
  const initialMode: Mode =
    preselectedMode && VALID_MODES.includes(preselectedMode as Mode) ? (preselectedMode as Mode) : "pick";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [accounts, setAccounts] = useState<FinAccount[]>(finAccounts);

  function onAccountCreated(a: FinAccount) {
    setAccounts((prev) => [...prev, a]);
  }

  // No accounts AND no entities yet → biggest first-time path: guide them.
  if (accounts.length === 0 && entities.length === 0) {
    return (
      <div className="space-y-3 text-center py-6">
        <p className="text-sm text-muted">
          You don&apos;t have any <strong>entities</strong> or <strong>accounts</strong> yet —
          a connection always belongs to an account, and accounts belong to entities.
        </p>
        <p className="text-xs text-muted">
          Start with an entity (e.g. &ldquo;Personal&rdquo;) in Settings, then create an account
          (e.g. &ldquo;Sparkasse Checking&rdquo;), then come back here to connect a data source.
        </p>
        <a href="/settings"><Button>Go to Settings → Entities</Button></a>
      </div>
    );
  }

  // Entities exist but no account → inline-create one without leaving the page.
  if (accounts.length === 0) {
    return (
      <InlineAccountCreate
        entities={entities}
        onCreated={onAccountCreated}
      />
    );
  }

  if (mode === "pick") return <ProviderPicker onPick={setMode} enableBankingConfigured={enableBankingConfigured} enableBankingEnv={enableBankingEnv} />;
  if (mode === "enablebanking") {
    return enableBankingConfigured
      ? <EnableBankingFlow onBack={() => setMode("pick")} env={enableBankingEnv} />
      : <EnableBankingNotConfigured onBack={() => setMode("pick")} />;
  }
  if (mode === "btc" || mode === "eth") {
    return <CryptoForm provider={mode === "btc" ? "btc_address" : "eth_address"}
      finAccounts={accounts} entities={entities}
      preselectedAccountId={preselectedAccountId}
      onCreateAccount={onAccountCreated}
      onBack={() => setMode("pick")} />;
  }
  if (mode === "csv") {
    return <CsvFlow finAccounts={accounts} entities={entities}
      preselectedAccountId={preselectedAccountId}
      onCreateAccount={onAccountCreated}
      onBack={() => setMode("pick")} />;
  }
  return <DepotCsvFlow finAccounts={accounts} entities={entities}
    onBack={() => setMode("pick")} />;
}

// ─── Inline help block ─────────────────────────────────────────────────────

function HelpBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs bg-bg border border-border rounded-lg p-3 text-muted space-y-1">
      {children}
    </div>
  );
}

// ─── Inline account create ─────────────────────────────────────────────────

function InlineAccountCreate({ entities, onCreated }: {
  entities: Entity[]; onCreated: (a: FinAccount) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("CHECKING");
  const [currency, setCurrency] = useState(entities[0]?.currency ?? "EUR");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, currency, entityId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onCreated({ id: data.id, name, kind, currency, entityId });
    else setError(data.error ?? "Save failed");
  }

  return (
    <div className="space-y-3">
      <HelpBox>
        First, create the <strong>account</strong> the connection will feed. Most users start
        with their primary checking account.
      </HelpBox>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sparkasse Checking" autoFocus />
        </div>
        <div>
          <Label>Kind</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["CHECKING", "SAVINGS", "BROKERAGE", "CRYPTO_WALLET", "CREDIT_CARD", "RETIREMENT", "CASH", "OTHER"]
              .map((k) => <option key={k} value={k}>{k.toLowerCase().replace(/_/g, " ")}</option>)}
          </Select>
        </div>
        <div>
          <Label>Currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="uppercase" />
        </div>
        <div>
          <Label>Entity</Label>
          <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </div>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <Button onClick={save} disabled={busy || !name.trim() || !entityId}>
        {busy ? "Creating…" : "Create account & continue"}
      </Button>
    </div>
  );
}

// ─── Provider picker ───────────────────────────────────────────────────────

function ProviderPicker({ onPick, enableBankingConfigured, enableBankingEnv }: {
  onPick: (m: Mode) => void; enableBankingConfigured: boolean; enableBankingEnv: "sandbox" | "production";
}) {
  const items: Array<{ id: Mode; title: string; desc: string; badge?: string; badgeTone?: "warning" | "neutral" }> = [
    { id: "enablebanking", title: "EU bank — automatic daily sync",
      desc: "Connect Sparkasse, Consors, N26 and other EU banks via Enable Banking (read-only PSD2 AIS). Balances and transactions pulled daily and on demand.",
      badge: !enableBankingConfigured
        ? "needs setup"
        : enableBankingEnv === "sandbox"
          ? "sandbox"
          : undefined,
      badgeTone: !enableBankingConfigured ? "warning" : "neutral" },
    { id: "csv", title: "Bank transactions CSV — works for everyone, no signup",
      desc: "Upload a transactions export from your bank or card. Each row becomes a Transaction. The universal fallback when a bank isn't on Enable Banking." },
    { id: "depot", title: "Broker depot CSV — current positions",
      desc: "Upload a positions export from your broker (Comdirect, Consors, Trade Republic). Each row becomes an Asset with its quantity. PSD2 can't expose depots, so CSV is the realistic path." },
    { id: "btc", title: "Bitcoin address (balance only)",
      desc: "Paste a public BTC address. We read its balance from mempool.space daily. No private keys ever leave you." },
    { id: "eth", title: "Ethereum address (balance only)",
      desc: "Paste a public ETH address. Read via a public RPC. No private keys, no transactions written." },
  ];
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onPick(i.id)}
            className="w-full text-left border border-border rounded-xl px-4 py-3 hover:bg-bg transition">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm">{i.title}</div>
              {i.badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded border ${
                  i.badgeTone === "warning"
                    ? "bg-yellow-500/15 text-yellow-700 border-yellow-500/30"
                    : "bg-accent/15 text-fg border-accent/30"
                }`}>
                  {i.badge}
                </span>
              )}
            </div>
            <div className="text-xs text-muted mt-0.5">{i.desc}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Enable Banking not-configured ─────────────────────────────────────────

function EnableBankingNotConfigured({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <h2 className="font-medium">EU-bank sync isn&apos;t configured yet</h2>
      <p className="text-sm text-muted">
        We use <strong>Enable Banking</strong> for PSD2 access (read-only). One-time setup,
        ~10 minutes. <em>(GoCardless Bank Account Data closed to new signups, so it&apos;s no
        longer the recommended path.)</em>
      </p>
      <ol className="text-sm space-y-2 list-decimal pl-5">
        <li>
          Sign up at{" "}
          <a href="https://enablebanking.com/" target="_blank" rel="noreferrer" className="underline text-accent">
            enablebanking.com
          </a>{" "}
          and verify your email (free sandbox + live application).
        </li>
        <li>
          In the <em>Control Panel</em>, create an <em>Application</em>:
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>Redirect URL: <code>{"<your domain>/api/banks/enablebanking/callback"}</code></li>
            <li>Environment: <em>Sandbox</em> to test, or <em>Production</em> for real data.</li>
            <li>Generate a new key pair. Download the <strong>private key</strong> PEM file and copy the <strong>application_id</strong> (UUID).</li>
          </ul>
        </li>
        <li>
          In your Vercel project (Settings → Environment Variables) add:
          <pre className="bg-bg border border-border rounded-lg p-2 mt-1 text-xs whitespace-pre-wrap">
ENABLE_BANKING_APP_ID = &lt;application_id&gt;
ENABLE_BANKING_PRIVATE_KEY = &lt;contents of the .pem file&gt;
ENABLE_BANKING_ENV = sandbox   # or "production" once your live app is approved
          </pre>
          <p className="text-xs text-muted mt-1">
            Paste the private key including the <code>-----BEGIN PRIVATE KEY-----</code> /
            <code>-----END PRIVATE KEY-----</code> lines. Vercel preserves multi-line values.
            The <code>ENABLE_BANKING_ENV</code> value is shown in the UI as a safety label.
          </p>
        </li>
        <li>Redeploy (or push any commit). Come back here — the EU-bank flow will be available.</li>
      </ol>
      <p className="text-xs text-muted">
        Until then, the <strong>Bank transactions CSV</strong> option above works for any bank
        with no setup — it&apos;s the universal fallback.
      </p>
    </div>
  );
}

// ─── Enable Banking flow ───────────────────────────────────────────────────

function EnableBankingFlow({ onBack, env }: { onBack: () => void; env: "sandbox" | "production" }) {
  const [country, setCountry] = useState("DE");
  const [filter, setFilter] = useState("");
  const [list, setList] = useState<Aspsp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/banks/enablebanking/aspsps?country=${country}`)
      .then(async (r) => r.ok ? r.json() : Promise.reject((await r.json()).error))
      .then(setList)
      .catch((e) => setError(typeof e === "string" ? e : "Failed"))
      .finally(() => setLoading(false));
  }, [country]);

  async function start(a: Aspsp) {
    setStarting(a.name); setError(null);
    const res = await fetch("/api/banks/enablebanking/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspspName: a.name, aspspCountry: a.country }),
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
      {env === "sandbox" && (
        <div className="text-xs px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-700">
          <strong>Sandbox mode.</strong> Only Enable Banking&apos;s test ASPSPs (e.g. <em>Nordea Sandbox</em>)
          will return data; real banks won&apos;t work until you switch the Application to Production and update
          <code> ENABLE_BANKING_ENV=production</code> (plus the production app id / key) in Vercel.
        </div>
      )}
      <HelpBox>
        Pick your bank. You&apos;ll be redirected to the bank&apos;s consent page to authorize
        <strong> read-only</strong> access. <strong>Ledger can never initiate a transfer</strong>
        {" "}— this is PSD2 AIS, not PIS. After consent we&apos;ll show your accounts so you can
        pick which to link. Consent typically lasts 180 days; you re-confirm at the bank when it expires.
      </HelpBox>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {["DE", "AT", "CH", "FR", "IT", "ES", "NL", "BE", "IE", "GB", "SE", "NO", "DK", "FI"].map((c) =>
              <option key={c} value={c}>{c}</option>)}
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
          {filtered.slice(0, 100).map((i) => (
            <li key={`${i.country}:${i.name}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex items-center gap-2">
                {i.logo && <img src={i.logo} alt="" className="w-6 h-6 object-contain" />}
                <div className="min-w-0">
                  <div className="text-sm truncate">{i.name}</div>
                  <div className="text-xs text-muted truncate">
                    {i.country}{i.maxConsentDays ? ` · up to ${i.maxConsentDays}-day consent` : ""}
                  </div>
                </div>
              </div>
              <Button variant="secondary" onClick={() => start(i)} disabled={starting === i.name}>
                {starting === i.name ? "…" : "Connect"}
              </Button>
            </li>
          ))}
          {filtered.length === 0 && <li className="p-3 text-xs text-muted">No matches.</li>}
        </ul>
      )}
    </div>
  );
}

// ─── Crypto address form ───────────────────────────────────────────────────

function CryptoForm({
  provider, finAccounts, entities, preselectedAccountId, onCreateAccount, onBack,
}: {
  provider: "btc_address" | "eth_address";
  finAccounts: FinAccount[]; entities: Entity[];
  preselectedAccountId: string | null;
  onCreateAccount: (a: FinAccount) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [finAccountId, setFinAccountId] = useState(preselectedAccountId ?? finAccounts[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch("/api/banks/crypto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, address: address.trim(), finAccountId, label: label.trim() || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push("/settings/banks");
    else setError(data.error ?? "Failed");
  }

  const isBtc = provider === "btc_address";
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <HelpBox>
        Paste only your <strong>public</strong> {isBtc ? "BTC" : "ETH"} address. We can&apos;t spend
        from it — we only read its balance.{" "}
        {isBtc
          ? <>In most wallets: <em>Receive</em> → copy the address starting with <code>bc1</code> or <code>1</code>.</>
          : <>In MetaMask/Ledger: click your account name to copy the <code>0x…</code> address.</>}
        {" "}<strong>Never paste a seed phrase or private key.</strong>
      </HelpBox>
      <div>
        <Label>{isBtc ? "Bitcoin address (public)" : "Ethereum address (public)"}</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder={isBtc ? "bc1q…" : "0x…"} autoFocus />
      </div>
      <div>
        <Label>Account to map this to</Label>
        <div className="flex gap-2 items-start">
          <Select value={finAccountId} onChange={(e) => setFinAccountId(e.target.value)} className="flex-1">
            {finAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <button type="button" onClick={() => setCreatingAccount((v) => !v)}
            className="text-xs px-2 py-1 rounded-md border border-border hover:bg-bg whitespace-nowrap">
            {creatingAccount ? "Cancel" : "+ New account"}
          </button>
        </div>
        <p className="text-xs text-muted mt-1">
          The balance shows up under this account. Create a dedicated &ldquo;BTC Wallet&rdquo; / &ldquo;ETH Wallet&rdquo;
          account if you don&apos;t have one.
        </p>
      </div>
      {creatingAccount && (
        <InlineAccountCreate entities={entities}
          onCreated={(a) => { onCreateAccount(a); setFinAccountId(a.id); setCreatingAccount(false); }} />
      )}
      <div>
        <Label>Label (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cold wallet, Ledger Nano, …" />
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <Button onClick={save} disabled={busy || !address.trim() || !finAccountId}>
        {busy ? "Saving…" : "Save & fetch balance now"}
      </Button>
    </div>
  );
}

// ─── Bank-transactions CSV flow ────────────────────────────────────────────

interface ParsedRow { date: string; amount: string; currency: string; description: string; merchant?: string }

function CsvFlow({
  finAccounts, entities, preselectedAccountId, onCreateAccount, onBack,
}: {
  finAccounts: FinAccount[]; entities: Entity[];
  preselectedAccountId: string | null;
  onCreateAccount: (a: FinAccount) => void;
  onBack: () => void;
}) {
  const preferred = preselectedAccountId
    ? finAccounts.find((a) => a.id === preselectedAccountId)
    : finAccounts[0];
  const [finAccountId, setFinAccountId] = useState(preferred?.id ?? "");
  const [currency, setCurrency] = useState(preferred?.currency ?? "EUR");
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; warnings: string[]; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; duplicates: number } | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

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
      method: "POST", headers: { "Content-Type": "application/json" },
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
      <HelpBox>
        <p><strong>What gets imported:</strong> bank transactions (date, amount, description, merchant). Each row becomes a Transaction in the account you pick.</p>
        <p><strong>How to export:</strong></p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li><strong>Sparkasse:</strong> Online-Banking → Umsätze → Filter date range → <em>Download</em> → CSV-CAMT format.</li>
          <li><strong>Consors:</strong> Konten → Umsätze → date range → <em>Export</em> → CSV.</li>
          <li><strong>N26:</strong> Statements → choose month → <em>CSV download</em>.</li>
          <li><strong>Other:</strong> any CSV with date, amount, description columns works.</li>
        </ul>
        <p>Duplicates are detected and skipped automatically.</p>
      </HelpBox>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Account</Label>
          <div className="flex gap-2 items-start">
            <Select value={finAccountId} onChange={(e) => {
              setFinAccountId(e.target.value);
              const a = finAccounts.find((x) => x.id === e.target.value);
              if (a) setCurrency(a.currency);
            }} className="flex-1">
              {finAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <button type="button" onClick={() => setCreatingAccount((v) => !v)}
              className="text-xs px-2 py-1 rounded-md border border-border hover:bg-bg whitespace-nowrap">
              {creatingAccount ? "Cancel" : "+ New"}
            </button>
          </div>
        </div>
        <div>
          <Label>Default currency (if not in CSV)</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="uppercase" />
        </div>
      </div>
      {creatingAccount && (
        <InlineAccountCreate entities={entities}
          onCreated={(a) => { onCreateAccount(a); setFinAccountId(a.id); setCurrency(a.currency); setCreatingAccount(false); }} />
      )}
      <div>
        <Label>CSV file</Label>
        <input type="file" accept=".csv,text/csv" onChange={onFile}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-sm" />
        <p className="text-xs text-muted mt-1">Comma or semicolon. German + English headers auto-detected.</p>
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

// ─── Broker depot CSV flow ─────────────────────────────────────────────────

interface DepotRow { isin?: string; ticker?: string; name: string; quantity: string; avgPrice?: string; currency: string }

function DepotCsvFlow({ finAccounts, entities, onBack }: {
  finAccounts: FinAccount[]; entities: Entity[]; onBack: () => void;
}) {
  const [finAccountId, setFinAccountId] = useState(finAccounts[0]?.id ?? "");
  const [currency, setCurrency] = useState(finAccounts[0]?.currency ?? "EUR");
  const [entityId, setEntityId] = useState<string>(entities[0]?.id ?? "");
  const [preview, setPreview] = useState<{ rows: DepotRow[]; warnings: string[]; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; reused: number; trades: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("currency", currency);
    const res = await fetch("/api/banks/csv/depot/preview", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setPreview({ rows: data.rows, warnings: data.warnings, fileName: data.fileName });
    else setError(data.error ?? "Parse failed");
  }

  async function commit() {
    if (!preview || !entityId) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/banks/csv/depot/commit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, finAccountId: finAccountId || undefined, rows: preview.rows }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setResult({ created: data.created, reused: data.reused, trades: data.trades });
    else setError(data.error ?? "Commit failed");
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted underline">← Back</button>
      <HelpBox>
        <p><strong>What gets imported:</strong> your current depot positions (one stock/ETF per row). Each row creates or finds an Asset with its quantity and average price.</p>
        <p><strong>How to export:</strong></p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li><strong>Comdirect:</strong> Depot → Bestand → <em>Drucken/Export</em> → CSV.</li>
          <li><strong>Consors:</strong> Depot → Bestand → <em>Export als CSV</em>.</li>
          <li><strong>Trade Republic:</strong> Profile → Activity → <em>Export</em> (CSV) — pick positions/portfolio.</li>
          <li><strong>Other:</strong> any CSV with ISIN/name and quantity columns works.</li>
        </ul>
        <p>If ISINs are present we resolve them to tickers automatically (OpenFIGI) and pull a live price.</p>
      </HelpBox>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Entity</Label>
          <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Cash account (optional link)</Label>
          <Select value={finAccountId} onChange={(e) => {
            setFinAccountId(e.target.value);
            const a = finAccounts.find((x) => x.id === e.target.value);
            if (a) setCurrency(a.currency);
          }}>
            <option value="">— none —</option>
            {finAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Default currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="uppercase" />
        </div>
      </div>
      <div>
        <Label>Depot CSV file</Label>
        <input type="file" accept=".csv,text/csv" onChange={onFile}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-sm" />
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      {busy && <p className="text-xs text-muted">Working…</p>}
      {preview && !result && (
        <div className="space-y-2">
          <p className="text-sm">{preview.rows.length} positions parsed from <strong>{preview.fileName}</strong>.</p>
          {preview.warnings.length > 0 && (
            <ul className="text-xs text-yellow-700 list-disc pl-4">
              {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <div className="border border-border rounded-xl max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-muted bg-bg sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Name</th>
                  <th className="text-left px-2 py-1.5">ISIN</th>
                  <th className="text-right px-2 py-1.5">Qty</th>
                  <th className="text-right px-2 py-1.5">Avg price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 truncate max-w-[220px]">{r.name}</td>
                    <td className="px-2 py-1 tnum">{r.isin ?? r.ticker ?? "—"}</td>
                    <td className="px-2 py-1 text-right tnum">{r.quantity}</td>
                    <td className="px-2 py-1 text-right tnum">{r.avgPrice ?? "—"} {r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={commit} disabled={busy || !entityId}>
            {busy ? "Importing…" : `Import ${preview.rows.length} position${preview.rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
      {result && (
        <p className="text-sm text-positive">
          {result.created} new asset{result.created === 1 ? "" : "s"} created · {result.reused} matched existing · {result.trades} record{result.trades === 1 ? "" : "s"} added.
        </p>
      )}
    </div>
  );
}
