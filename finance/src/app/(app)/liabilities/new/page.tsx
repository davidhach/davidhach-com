"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select } from "@/components/ui/primitives";

const KINDS = ["CREDIT_CARD", "LOAN", "MORTGAGE", "STUDENT_LOAN", "TAX", "PAYABLE", "OTHER"];

export default function NewLiabilityPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch("/api/entities").then((r) => r.json()).then(setEntities); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/liabilities", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error ?? "Failed"); setSubmitting(false); return; }
    router.push("/liabilities");
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-5 tracking-tight">Add liability</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div><Label>Name</Label><Input name="name" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Kind</Label>
              <Select name="kind" defaultValue="LOAN">{KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</Select>
            </div>
            <div><Label>Currency</Label><Input name="currency" defaultValue="USD" maxLength={3} className="uppercase" /></div>
          </div>
          <div><Label>Entity</Label>
            <Select name="entityId" required>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Current balance</Label><Input name="currentValue" required inputMode="decimal" /></div>
            <div><Label>Interest rate %</Label><Input name="interestRate" inputMode="decimal" placeholder="5.25" /></div>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save liability"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
