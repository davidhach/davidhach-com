"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select } from "@/components/ui/primitives";

const ASSET_CLASSES = ["CASH", "EQUITY", "BOND", "CRYPTO", "REAL_ESTATE", "COMMODITY", "PRIVATE_EQUITY", "COLLECTIBLE", "RETIREMENT", "RECEIVABLE", "OTHER"];

export default function NewAssetPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/entities").then((r) => r.json()).then(setEntities);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
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
              <Select name="assetClass" defaultValue="CASH">
                {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input name="currency" defaultValue="USD" maxLength={3} className="uppercase" />
            </div>
          </div>
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
