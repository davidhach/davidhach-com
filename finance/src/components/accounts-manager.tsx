"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Badge } from "@/components/ui/primitives";
import { DISPLAY_CURRENCIES } from "@/lib/currencies";

interface Entity { id: string; name: string; currency: string }
interface Account {
  id: string;
  name: string;
  kind: string;
  currency: string;
  institution: string;
  entityId: string;
  entityName: string;
  counts: { transactions: number; assets: number; liabilities: number; bankLinks: number };
}

const KINDS = [
  "CHECKING", "SAVINGS", "CREDIT_CARD", "BROKERAGE", "RETIREMENT",
  "CRYPTO_WALLET", "CASH", "LOAN", "MORTGAGE", "REAL_ESTATE", "OTHER",
];

export function AccountsManager({ initial, entities }: { initial: Account[]; entities: Entity[] }) {
  const [accounts, setAccounts] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-negative border border-negative/20 bg-negative/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {accounts.length === 0 && !adding && (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-muted">No accounts yet.</p>
          <Button onClick={() => { setAdding(true); setError(null); }}>+ Add an account</Button>
        </div>
      )}

      {accounts.length > 0 && (
        <ul className="divide-y divide-border">
          {accounts.map((a) => (
            <li key={a.id} className="py-3">
              {editingId === a.id ? (
                <EditRow account={a} entities={entities}
                  onCancel={() => setEditingId(null)}
                  onError={setError}
                  onSaved={(u) => {
                    setAccounts((p) => p.map((x) => x.id === u.id ? { ...x, ...u } : x));
                    setEditingId(null);
                  }} />
              ) : (
                <DisplayRow account={a}
                  onEdit={() => { setEditingId(a.id); setError(null); }}
                  onError={setError}
                  onDeleted={() => setAccounts((p) => p.filter((x) => x.id !== a.id))} />
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddRow entities={entities}
          onCancel={() => setAdding(false)}
          onError={setError}
          onSaved={(c) => { setAccounts((p) => [...p, c]); setAdding(false); }} />
      ) : accounts.length > 0 ? (
        <Button variant="secondary" onClick={() => { setAdding(true); setError(null); }}>
          + New account
        </Button>
      ) : null}
    </div>
  );
}

function DisplayRow({ account: a, onEdit, onDeleted, onError }: {
  account: Account; onEdit: () => void; onDeleted: () => void; onError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
    setBusy(true); onError(null);
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { onDeleted(); router.refresh(); }
    else onError(data.error ?? "Delete failed");
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{a.name}</div>
        <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
          <Badge>{a.kind.toLowerCase().replace(/_/g, " ")}</Badge>
          <span>{a.currency}</span>
          <span>· {a.entityName}</span>
          {a.institution && <span>· {a.institution}</span>}
        </div>
        <div className="text-xs text-muted mt-0.5">
          {a.counts.transactions} txn · {a.counts.assets} asset · {a.counts.liabilities} liability · {a.counts.bankLinks} connection
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
        <Button variant="destructive" onClick={del} disabled={busy}>{busy ? "…" : "Delete"}</Button>
      </div>
    </div>
  );
}

function AccountForm({
  defaults, entities, onCancel, onError, onSaved, primaryLabel,
}: {
  defaults: Partial<Account>;
  entities: Entity[];
  onCancel: () => void;
  onError: (s: string | null) => void;
  onSaved: (a: Account) => void;
  primaryLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaults.name ?? "");
  const [kind, setKind] = useState(defaults.kind ?? "CHECKING");
  const [currency, setCurrency] = useState(defaults.currency ?? entities[0]?.currency ?? "USD");
  const [institution, setInstitution] = useState(defaults.institution ?? "");
  const [entityId, setEntityId] = useState(defaults.entityId ?? entities[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); onError(null);
    const body = { name, kind, currency, institution: institution || undefined, entityId };
    const url = defaults.id ? `/api/accounts/${defaults.id}` : "/api/accounts";
    const method = defaults.id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      const entity = entities.find((e) => e.id === entityId);
      onSaved({
        id: data.id ?? defaults.id!, name, kind, currency, institution,
        entityId, entityName: entity?.name ?? "—",
        counts: defaults.counts ?? { transactions: 0, assets: 0, liabilities: 0, bankLinks: 0 },
      });
      router.refresh();
    } else {
      onError(data.error ?? "Save failed");
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_180px] gap-2 items-end">
      <div>
        <Label htmlFor={`name-${defaults.id ?? "new"}`}>Name</Label>
        <Input id={`name-${defaults.id ?? "new"}`} value={name} onChange={(e) => setName(e.target.value)}
          autoFocus placeholder="Chase Checking, IB Brokerage, Coinbase…" />
      </div>
      <div>
        <Label>Kind</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase().replace(/_/g, " ")}</option>)}
        </Select>
      </div>
      <div>
        <Label>Currency</Label>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {DISPLAY_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </Select>
      </div>
      <div>
        <Label>Entity (required)</Label>
        <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </div>
      <div className="md:col-span-4">
        <Label>Institution (optional)</Label>
        <Input value={institution} onChange={(e) => setInstitution(e.target.value)}
          placeholder="Sparkasse Dillingen, Consors, Coinbase…" />
      </div>
      <div className="md:col-span-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || !name.trim() || !entityId}>
          {busy ? "…" : primaryLabel}
        </Button>
      </div>
    </div>
  );
}

function AddRow(props: { entities: Entity[]; onCancel: () => void; onError: (s: string | null) => void; onSaved: (a: Account) => void }) {
  return (
    <div className="border-t border-border pt-3">
      <AccountForm defaults={{}} primaryLabel="Create" {...props} />
    </div>
  );
}

function EditRow({ account, ...rest }: { account: Account; entities: Entity[]; onCancel: () => void; onError: (s: string | null) => void; onSaved: (a: Account) => void }) {
  return <AccountForm defaults={account} primaryLabel="Save" {...rest} />;
}
