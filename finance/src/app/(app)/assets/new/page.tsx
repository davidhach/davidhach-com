"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select } from "@/components/ui/primitives";

const ASSET_CLASSES = [
  "CASH", "STOCKS", "COMPANY_SHARES", "BOND", "CRYPTO", "COMMODITY", "REAL_ESTATE",
  "PRIVATE_EQUITY", "COLLECTIBLE", "RETIREMENT", "RECEIVABLE", "LOAN_RECEIVABLE", "OTHER",
];

// Price-adapter pickers per asset class. Empty = manual valuation only.
const SOURCES_BY_CLASS: Record<string, { id: string; label: string; placeholder: string }[]> = {
  STOCKS:    [{ id: "stooq",     label: "Stooq",     placeholder: "AAPL.US, SAP.DE, MSFT.US" }],
  CRYPTO:    [{ id: "coingecko", label: "CoinGecko", placeholder: "bitcoin, ethereum, solana" }],
  COMMODITY: [{ id: "metals",    label: "Metals",    placeholder: "GOLD, SILVER, PLATINUM, PALLADIUM" }],
};

export default function NewAssetPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [assetClass, setAssetClass] = useState<string>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/entities").then((r) => r.json()).then(setEntities);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, string>;
    // Drop empty optional fields so zod doesn't reject ""s.
    for (const k of Object.keys(body)) if (body[k] === "") delete body[k];
    const res = await fetch("/api/assets", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Failed");
      setSubmitting(false);
      return;
    }
    router.push("/assets");
  }

  const sources = SOURCES_BY_CLASS[assetClass] ?? [];

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-5 tracking-tight">Add asset</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input name="name" id="name" required placeholder="Primary residence, AAPL, Brokerage cash…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Asset class</Label>
              <Select name="assetClass" value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
                {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input name="currency" defaultValue="USD" maxLength={3} className="uppercase" />
            </div>
          </div>

          {sources.length > 0 && (
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div>
                <Label>Price source</Label>
                <Select name="priceSource" defaultValue={sources[0].id}>
                  <option value="manual">Manual</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>Identifier (ticker / coin id / metal)</Label>
                <Input name="externalRef" placeholder={sources[0].placeholder} />
              </div>
            </div>
          )}

          {assetClass === "STOCKS" && (
            <div>
              <Label>ISIN (optional, for your records)</Label>
              <Input name="symbol" placeholder="US0378331005" />
            </div>
          )}
          <div>
            <Label>Entity</Label>
            <Select name="entityId" required>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current value</Label>
              <Input name="currentValue" required inputMode="decimal" placeholder="12345.67" />
            </div>
            <div>
              <Label>Cost basis (optional)</Label>
              <Input name="costBasis" inputMode="decimal" placeholder="10000.00" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input name="notes" placeholder="Anything to remember about this asset" />
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
