"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Badge } from "@/components/ui/primitives";
import { DISPLAY_CURRENCIES } from "@/lib/currencies";

interface Entity {
  id: string;
  name: string;
  kind: string;
  currency: string;
  _counts?: { assets: number; liabilities: number; finAccounts: number };
}

const KINDS = ["PERSONAL", "COMPANY", "TRUST", "JOINT", "INVESTMENT", "OTHER"];

export function EntitiesManager({ initial }: { initial: Entity[] }) {
  const router = useRouter();
  const [entities, setEntities] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() { router.refresh(); }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-negative border border-negative/20 bg-negative/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {entities.length === 0 && !adding ? (
        <p className="text-sm text-muted">No entities yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {entities.map((e) => (
            <li key={e.id} className="py-3">
              {editingId === e.id ? (
                <EditRow entity={e}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setEntities((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x));
                    setEditingId(null);
                    refresh();
                  }}
                  onError={setError}
                />
              ) : (
                <DisplayRow entity={e}
                  onEdit={() => { setEditingId(e.id); setError(null); }}
                  onDeleted={() => {
                    setEntities((prev) => prev.filter((x) => x.id !== e.id));
                    refresh();
                  }}
                  onError={setError}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddRow
          onCancel={() => setAdding(false)}
          onSaved={(created) => { setEntities((prev) => [...prev, created]); setAdding(false); refresh(); }}
          onError={setError}
        />
      ) : (
        <Button variant="secondary" onClick={() => { setAdding(true); setError(null); }}>
          + New entity
        </Button>
      )}
    </div>
  );
}

function DisplayRow({ entity: e, onEdit, onDeleted, onError }: {
  entity: Entity; onEdit: () => void; onDeleted: () => void; onError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(`Delete "${e.name}"? This cannot be undone.`)) return;
    setBusy(true);
    onError(null);
    const res = await fetch(`/api/entities/${e.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDeleted();
    else onError(data.error ?? "Delete failed");
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{e.name}</div>
        <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
          <Badge>{e.kind.toLowerCase()}</Badge>
          <span>{e.currency}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
        <Button variant="destructive" onClick={del} disabled={busy}>
          {busy ? "…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function EditRow({ entity, onCancel, onSaved, onError }: {
  entity: Entity;
  onCancel: () => void;
  onSaved: (e: Entity) => void;
  onError: (s: string | null) => void;
}) {
  const [name, setName] = useState(entity.name);
  const [kind, setKind] = useState(entity.kind);
  const [currency, setCurrency] = useState(entity.currency);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); onError(null);
    const res = await fetch(`/api/entities/${entity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, currency }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onSaved(data);
    else onError(data.error ?? "Save failed");
  }

  return (
    <div className="grid grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
      <div>
        <Label htmlFor={`name-${entity.id}`}>Name</Label>
        <Input id={`name-${entity.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Kind</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
        </Select>
      </div>
      <div>
        <Label>Currency</Label>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {DISPLAY_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? "…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function AddRow({ onCancel, onSaved, onError }: {
  onCancel: () => void; onSaved: (e: Entity) => void; onError: (s: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("PERSONAL");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); onError(null);
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, currency }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onSaved(data);
    else onError(data.error ?? "Create failed");
  }

  return (
    <div className="grid grid-cols-[1fr_140px_140px_auto] gap-2 items-end border-t border-border pt-3">
      <div>
        <Label htmlFor="new-ent-name">Name</Label>
        <Input id="new-ent-name" value={name} onChange={(e) => setName(e.target.value)}
          autoFocus placeholder="Personal, Holding GmbH, …" />
      </div>
      <div>
        <Label>Kind</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
        </Select>
      </div>
      <div>
        <Label>Currency</Label>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {DISPLAY_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? "…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
