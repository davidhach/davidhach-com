"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "decimal.js";
import { Card, Button, Input, Label, Select } from "@/components/ui/primitives";
import { DISPLAY_CURRENCIES } from "@/lib/currencies";

const ASSET_CLASSES = [
  "CASH", "STOCKS", "COMPANY_SHARES", "BOND", "CRYPTO", "COMMODITY", "REAL_ESTATE",
  "PRIVATE_EQUITY", "COLLECTIBLE", "RETIREMENT", "RECEIVABLE", "LOAN_RECEIVABLE", "OTHER",
];

// Auto-priced classes: quantity × adapter price; everything else is manual value.
const PRICED: Record<string, { adapter: string; refLabel: string; refPlaceholder: string }> = {
  STOCKS:    { adapter: "stooq",     refLabel: "Ticker (Stooq suffix)", refPlaceholder: "AAPL.US, SAP.DE, MEUD.FR" },
  CRYPTO:    { adapter: "coingecko", refLabel: "CoinGecko coin id",     refPlaceholder: "bitcoin, ethereum" },
  COMMODITY: { adapter: "metals",    refLabel: "Metal",                 refPlaceholder: "GOLD, SILVER, PLATINUM" },
};

interface Entity { id: string; name: string; currency: string }

export interface AssetFormInitial {
  id?: string;
  name?: string;
  assetClass?: string;
  currency?: string;
  entityId?: string;
  symbol?: string | null;          // ISIN or other symbol
  externalRef?: string | null;
  priceSource?: string | null;
  quantity?: string | null;
  costBasis?: string | null;
  currentValue?: string | null;
  notes?: string | null;
}

export function AssetForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: AssetFormInitial;
}) {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);

  // ── Form state, pre-filled from `initial` when editing ────────────────────
  const [assetClass, setAssetClass] = useState<string>(initial?.assetClass ?? "CASH");
  const [isin, setIsin] = useState(initial?.symbol ?? "");
  const [isinState, setIsinState] = useState<"idle" | "loading" | "ok" | "manual" | "error">("idle");
  const [isinMsg, setIsinMsg] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [externalRef, setExternalRef] = useState(initial?.externalRef ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [entityId, setEntityId] = useState(initial?.entityId ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [buyPrice, setBuyPrice] = useState("");
  const [currentValue, setCurrentValue] = useState(initial?.currentValue ?? "");
  const [costBasis, setCostBasis] = useState(initial?.costBasis ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/entities").then((r) => r.json()).then((es: Entity[]) => {
      setEntities(es);
      if (!initial?.entityId && es[0]) {
        setEntityId(es[0].id);
        if (!initial?.currency) setCurrency(es[0].currency);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priced = PRICED[assetClass];

  async function resolveIsinNow() {
    const v = isin.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) {
      setIsinState("error"); setIsinMsg("That doesn't look like an ISIN (12 chars).");
      return;
    }
    setIsinState("loading"); setIsinMsg(null);
    // Hard 8s client-side budget. If the upstream API / Stooq / Yahoo all hang,
    // the user can still save the asset without a resolved listing — we just
    // store the ISIN as `symbol` and a later refresh / manual Resolve will
    // attach the price source.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("/api/assets/resolve-isin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin: v, preferredCurrency: currency }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const r = await res.json();
        setName(r.name ?? r.ticker);
        setExternalRef(r.stooqRef);
        setIsinState("ok");
        const ccyNote = r.currency && r.currency !== currency
          ? ` — listing is priced in ${r.currency}, your asset is ${currency} (we'll FX-convert)`
          : "";
        setIsinMsg(`Resolved to ${r.ticker} (${r.stooqRef})${ccyNote}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setIsinState("manual");
        setIsinMsg(data.error ?? "Couldn't resolve — you can save anyway and we'll retry on first price refresh, or enter the ticker manually below.");
      }
    } catch {
      setIsinState("manual");
      setIsinMsg("Resolution timed out. Save the asset anyway and we'll retry in the background, or enter the ticker manually below.");
    } finally {
      clearTimeout(t);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);

    // For priced classes: compute initial currentValue if qty + buy price are given.
    // In edit mode, leave currentValue alone unless the user types a new buy price.
    let computedValue = currentValue;
    if (priced) {
      if (quantity && buyPrice) {
        computedValue = new Decimal(quantity).mul(new Decimal(buyPrice)).toFixed(2);
      } else if (mode === "create" && !currentValue) {
        computedValue = "0.00";
      }
    }

    const body: Record<string, unknown> = {
      entityId, name, currency, assetClass,
    };
    // currentValue: required on create, optional on edit.
    if (computedValue) body.currentValue = computedValue;
    const trimmedRef = externalRef.trim();
    if (priced) {
      // Only set priceSource when we actually have a ref to feed it. STOCKS
      // with just an ISIN (no resolved ticker) save without a price source;
      // we'll trigger /resolve in the background right after save.
      if (trimmedRef) {
        body.priceSource = priced.adapter;
        body.externalRef = trimmedRef;
      }
      if (quantity) body.quantity = quantity;
      if (buyPrice && quantity) body.costBasis = new Decimal(quantity).mul(new Decimal(buyPrice)).toFixed(2);
      else if (costBasis) body.costBasis = costBasis;
    } else {
      if (costBasis) body.costBasis = costBasis;
    }
    if (assetClass === "STOCKS" && isin) body.symbol = isin.trim().toUpperCase();
    if (notes) body.notes = notes;

    const url = mode === "edit" && initial?.id ? `/api/assets/${initial.id}` : "/api/assets";
    const method = mode === "edit" ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e2 = await res.json().catch(() => ({}));
      setError(e2.error ?? "Save failed");
      setSubmitting(false);
      return;
    }
    const saved = await res.json();

    // On CREATE with priced + initial qty + buy price, record an opening BUY so
    // cost basis + P/L work. On EDIT we leave the trade ledger alone (the
    // dedicated BUY/SELL workflow under /update handles that).
    if (mode === "create" && priced && quantity && buyPrice && !isNaN(+quantity) && +quantity > 0) {
      await fetch(`/api/assets/${saved.id}/transactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "BUY",
          date: new Date().toISOString().slice(0, 10),
          quantity, pricePerUnit: buyPrice, currency,
        }),
      });
    }

    // STOCKS with an ISIN but no resolved ticker yet → fire-and-forget resolve.
    // We don't await: the page navigates immediately and the next price refresh
    // will pick up the new priceSource.
    if (mode === "create" && assetClass === "STOCKS" && isin && !trimmedRef) {
      fetch(`/api/assets/${saved.id}/resolve`, { method: "POST" }).catch(() => {});
    }

    router.push(mode === "edit" && initial?.id ? `/assets/${initial.id}` : "/assets");
    router.refresh();
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-5 tracking-tight">
        {mode === "edit" ? "Edit asset" : "Add asset"}
      </h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Asset class</Label>
              <Select value={assetClass} onChange={(e) => {
                setAssetClass(e.target.value);
                setIsin(""); setIsinState("idle"); setIsinMsg(null);
                // Don't wipe externalRef on edit — user may want to switch class while keeping it.
                if (mode === "create") setExternalRef("");
              }}>
                {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {DISPLAY_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </Select>
            </div>
          </div>

          {mode === "create" && assetClass === "CASH" && (
            <div className="text-xs border border-border rounded-lg p-3 bg-bg/60 flex items-start justify-between gap-3">
              <p className="text-muted">
                <strong>Tip:</strong> instead of tracking a cash balance by hand, you can
                <strong> connect the bank account</strong> for live balance + auto-imported transactions.
                Sparkasse, Consors, N26 and most EU banks are supported via PSD2 (read-only).
              </p>
              <a href="/settings/banks/new"
                className="shrink-0 text-xs px-2 py-1.5 rounded-md border border-accent/40 text-fg bg-accent/15 hover:bg-accent/25 whitespace-nowrap">
                Connect a bank →
              </a>
            </div>
          )}

          {assetClass === "STOCKS" && (
            <div className="border border-border rounded-xl p-3 space-y-2">
              <Label htmlFor="isin">ISIN</Label>
              <div className="flex gap-2">
                <Input id="isin" value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())}
                  placeholder="US0378331005" maxLength={12} className="flex-1" />
                <Button type="button" variant="secondary" onClick={resolveIsinNow} disabled={isinState === "loading"}>
                  {isinState === "loading" ? "…" : "Resolve"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                12 characters (e.g. <code>US0378331005</code> for Apple, <code>DE0007164600</code> for SAP).
                We pick the listing that returns a live price AND matches your currency above.
              </p>
              {isinMsg && (
                <p className={`text-xs ${isinState === "ok" ? "text-positive" : isinState === "error" ? "text-negative" : "text-muted"}`}>
                  {isinMsg}
                </p>
              )}
            </div>
          )}

          {priced && (
            <div>
              <Label>{priced.refLabel}{assetClass === "STOCKS" && isin ? " (optional — auto-resolved from ISIN)" : ""}</Label>
              <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)}
                placeholder={priced.refPlaceholder}
                // STOCKS with an ISIN can save without an explicit ticker — the
                // server will resolve later. Other priced classes still need a ref.
                required={assetClass !== "STOCKS" || !isin.trim()} />
              <p className="text-xs text-muted mt-1">
                {assetClass === "STOCKS" && <>Stooq suffix: <code>.US</code>, <code>.DE</code> (Xetra), <code>.FR</code> (Paris), <code>.UK</code> (LSE — pence, auto-converted), <code>.JP</code>, <code>.CH</code>…</>}
                {assetClass === "CRYPTO" && <>CoinGecko coin id — find it at <a href="https://www.coingecko.com" target="_blank" rel="noreferrer" className="underline">coingecko.com</a> (URL slug, e.g. <code>bitcoin</code>).</>}
                {assetClass === "COMMODITY" && <>Use <code>GOLD</code>, <code>SILVER</code>, <code>PLATINUM</code>, or <code>PALLADIUM</code>.</>}
                {" "}Price refreshed daily and on demand. Value = quantity × latest price.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
              required placeholder={priced ? "Apple Inc, Bitcoin, …" : "Primary residence, Brokerage cash, …"} />
          </div>

          <div>
            <Label>Entity</Label>
            <div className="flex gap-2 items-start">
              <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} required className="flex-1">
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <a href="/settings#entities" className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-bg whitespace-nowrap text-muted">
                + New
              </a>
            </div>
          </div>

          {priced ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{mode === "edit" ? "Quantity" : "Initial quantity (optional)"}</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal" placeholder="10" />
              </div>
              <div>
                <Label>
                  {mode === "edit" ? "Buy price/unit (records a new BUY)" : "Buy price per unit (for cost basis)"}
                </Label>
                <Input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)}
                  inputMode="decimal" placeholder="175.50" />
              </div>
              <p className="text-xs text-muted col-span-2">
                {mode === "edit"
                  ? "Tip: for buys/sells AFTER the initial position, use the dedicated BUY/SELL workflow under Update — it adjusts quantity correctly and computes realised P/L."
                  : "Leave both blank to add the holding empty — record buys/sells later under Update."}
              </p>
              {mode === "edit" && (
                <div className="col-span-2">
                  <Label>Cost basis (override)</Label>
                  <Input value={costBasis} onChange={(e) => setCostBasis(e.target.value)}
                    inputMode="decimal" placeholder="10000.00" />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current value</Label>
                <Input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)}
                  required={mode === "create"} inputMode="decimal" placeholder="12345.67" />
              </div>
              <div>
                <Label>Cost basis (optional)</Label>
                <Input value={costBasis} onChange={(e) => setCostBasis(e.target.value)}
                  inputMode="decimal" placeholder="10000.00" />
              </div>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember about this asset" />
          </div>

          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Save asset"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
