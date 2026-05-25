"use client";
import { useEffect, useState } from "react";
import { Button, Input, Select } from "@/components/ui/primitives";

interface Asset { id: string; name: string; symbol: string | null; currency: string; priceSource: string | null; externalRef: string | null }

interface Suggestion {
  transactionId: string;
  finAccountId: string;
  finAccountName: string;
  entityId: string;
  date: string;
  amount: string;
  currency: string;
  description: string;
  merchant: string | null;
  signal: { kind: "BUY" | "SELL"; quantity?: string; pricePerUnit?: string; name?: string; isin?: string };
}

/**
 * Lists candidates detected from connected-cash transactions. Each row lets
 * the user confirm into an existing Asset; we never auto-create the trade.
 */
export function SuggestedTrades({ assets }: { assets: Asset[] }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/trades/suggestions")
      .then((r) => r.ok ? r.json() : [])
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-sm text-muted">
        Suggested trades · {items.length} candidate{items.length === 1 ? "" : "s"} from your bank transactions
      </h2>
      <p className="text-xs text-muted">
        These look like securities orders on a connected account. Confirm to record the
        BUY/SELL — we never apply them automatically.
      </p>
      <ul className="divide-y divide-border border border-border rounded-xl">
        {items.map((s) => (
          <SuggestionRow key={s.transactionId} s={s} assets={assets}
            onConfirmed={() => setItems((prev) => prev?.filter((x) => x.transactionId !== s.transactionId) ?? null)}
            disabled={busy} setBusy={setBusy} />
        ))}
      </ul>
    </div>
  );
}

function SuggestionRow({
  s, assets, onConfirmed, disabled, setBusy,
}: {
  s: Suggestion; assets: Asset[];
  onConfirmed: () => void;
  disabled: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [assetId, setAssetId] = useState<string>(suggestedAsset(s, assets));
  const [quantity, setQuantity] = useState(s.signal.quantity ?? "");
  const [price, setPrice] = useState(s.signal.pricePerUnit ?? "");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!assetId || !quantity || !price) { setError("Pick asset, quantity, price."); return; }
    setBusy(true); setError(null);
    const res = await fetch("/api/trades/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionId: s.transactionId, assetId,
        kind: s.signal.kind, quantity, pricePerUnit: price, currency: s.currency, date: s.date,
      }),
    });
    setBusy(false);
    if (res.ok) onConfirmed();
    else setError("Failed");
  }

  return (
    <li className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0">
          <div className="text-sm">{s.merchant ?? s.description}</div>
          <div className="text-muted truncate">
            {s.date} · {s.finAccountName} · {s.amount} {s.currency} · candidate {s.signal.kind}
            {s.signal.isin && ` · ISIN ${s.signal.isin}`}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_110px_auto] gap-2 items-end">
        <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">Pick asset…</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.symbol ? `(${a.symbol})` : ""}
            </option>
          ))}
        </Select>
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="Quantity" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={`Price/unit ${s.currency}`} />
        <Button onClick={confirm} disabled={disabled}>Confirm {s.signal.kind}</Button>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
    </li>
  );
}

function suggestedAsset(s: Suggestion, assets: Asset[]): string {
  if (s.signal.isin) {
    const hit = assets.find((a) => a.symbol === s.signal.isin);
    if (hit) return hit.id;
  }
  if (s.signal.name) {
    const hit = assets.find((a) => a.name.toLowerCase().includes(s.signal.name!.toLowerCase()));
    if (hit) return hit.id;
  }
  return "";
}
