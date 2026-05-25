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

// Auto-priced classes use quantity × adapter price; everything else uses a manual value.
const PRICED: Record<string, { adapter: string; refLabel: string; refPlaceholder: string }> = {
  STOCKS:    { adapter: "stooq",     refLabel: "Ticker (with Stooq suffix)", refPlaceholder: "AAPL.US, SAP.DE" },
  CRYPTO:    { adapter: "coingecko", refLabel: "CoinGecko coin id",          refPlaceholder: "bitcoin, ethereum" },
  COMMODITY: { adapter: "metals",    refLabel: "Metal",                       refPlaceholder: "GOLD, SILVER, PLATINUM" },
};

interface Entity { id: string; name: string; currency: string }

export default function NewAssetPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [assetClass, setAssetClass] = useState<string>("CASH");

  // STOCKS-specific ISIN flow.
  const [isin, setIsin] = useState("");
  const [isinState, setIsinState] = useState<"idle" | "loading" | "ok" | "manual" | "error">("idle");
  const [isinMsg, setIsinMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [externalRef, setExternalRef] = useState("");        // ticker / coin id / metal
  const [currency, setCurrency] = useState("USD");
  const [entityId, setEntityId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/entities").then((r) => r.json()).then((es: Entity[]) => {
      setEntities(es);
      if (es[0]) { setEntityId(es[0].id); setCurrency(es[0].currency); }
    });
  }, []);

  const priced = PRICED[assetClass];

  async function resolveIsin() {
    const v = isin.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) {
      setIsinState("error"); setIsinMsg("That doesn't look like an ISIN (12 chars).");
      return;
    }
    setIsinState("loading"); setIsinMsg(null);
    const res = await fetch("/api/assets/resolve-isin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isin: v }),
    });
    if (res.ok) {
      const r = await res.json();
      setName(r.name ?? r.ticker);
      setExternalRef(r.stooqRef);
      setIsinState("ok");
      setIsinMsg(`Resolved to ${r.ticker} (${r.stooqRef})`);
    } else {
      const data = await res.json().catch(() => ({}));
      setIsinState("manual");
      setIsinMsg(data.error ?? "Couldn't resolve — enter the ticker manually below.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);

    // For priced classes: compute initial currentValue if user supplied qty + buy price.
    let computedValue = currentValue;
    if (priced) {
      if (quantity && buyPrice) {
        computedValue = new Decimal(quantity).mul(new Decimal(buyPrice)).toFixed(2);
      } else if (!currentValue) {
        computedValue = "0.00";
      }
    }

    const body: Record<string, unknown> = {
      entityId, name, currency, assetClass,
      currentValue: computedValue,
    };
    if (priced) {
      body.priceSource = priced.adapter;
      body.externalRef = externalRef.trim();
      if (quantity) body.quantity = quantity;
      if (buyPrice && quantity) body.costBasis = new Decimal(quantity).mul(new Decimal(buyPrice)).toFixed(2);
    } else {
      if (costBasis) body.costBasis = costBasis;
    }
    if (assetClass === "STOCKS" && isin) body.symbol = isin.trim().toUpperCase();
    if (notes) body.notes = notes;

    const res = await fetch("/api/assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e2 = await res.json().catch(() => ({}));
      setError(e2.error ?? "Save failed");
      setSubmitting(false);
      return;
    }
    const created = await res.json();

    // Record the initial buy as an AssetTransaction so cost basis & P/L work.
    if (priced && quantity && buyPrice && !isNaN(+quantity) && +quantity > 0) {
      await fetch(`/api/assets/${created.id}/transactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "BUY",
          date: new Date().toISOString().slice(0, 10),
          quantity, pricePerUnit: buyPrice, currency,
        }),
      });
    }
    router.push("/assets");
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-5 tracking-tight">Add asset</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Asset class</Label>
              <Select value={assetClass} onChange={(e) => {
                setAssetClass(e.target.value);
                // Reset class-specific fields when switching.
                setIsin(""); setIsinState("idle"); setIsinMsg(null);
                setExternalRef("");
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

          {assetClass === "STOCKS" && (
            <div className="border border-border rounded-xl p-3 space-y-2">
              <Label htmlFor="isin">ISIN</Label>
              <div className="flex gap-2">
                <Input id="isin" value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())}
                  placeholder="US0378331005" maxLength={12} className="flex-1" />
                <Button type="button" variant="secondary" onClick={resolveIsin} disabled={isinState === "loading"}>
                  {isinState === "loading" ? "…" : "Resolve"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                12 characters (e.g. <code>US0378331005</code> for Apple, <code>DE0007164600</code> for SAP).
                We look it up on OpenFIGI and pre-fill name + ticker.
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
              <Label>{priced.refLabel}</Label>
              <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)}
                placeholder={priced.refPlaceholder} required />
              <p className="text-xs text-muted mt-1">
                {assetClass === "STOCKS" && <>Use the Stooq suffix: <code>.US</code> (NYSE/NASDAQ), <code>.DE</code> (Xetra), <code>.UK</code> (LSE), <code>.JP</code>, <code>.CH</code>, …</>}
                {assetClass === "CRYPTO" && <>CoinGecko coin id — find it at <a href="https://www.coingecko.com" target="_blank" rel="noreferrer" className="underline">coingecko.com</a> (the URL slug, e.g. <code>bitcoin</code>).</>}
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
            <p className="text-xs text-muted mt-1">
              An entity is a logical owner (e.g. &ldquo;Personal&rdquo;, &ldquo;Holding GmbH&rdquo;).
            </p>
          </div>

          {priced ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Initial quantity (optional)</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal" placeholder="10" />
              </div>
              <div>
                <Label>Buy price per unit (for cost basis)</Label>
                <Input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)}
                  inputMode="decimal" placeholder="175.50" />
              </div>
              <p className="text-xs text-muted col-span-2">
                Leave both blank to add the holding empty — record buys/sells later under <em>Update</em>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current value</Label>
                <Input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)}
                  required inputMode="decimal" placeholder="12345.67" />
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
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save asset"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
