"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Badge } from "@/components/ui/primitives";

export interface CategoryRow {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY";
  txCount: number;
}

const KINDS: Array<CategoryRow["kind"]> = ["EXPENSE", "INCOME", "ASSET", "LIABILITY"];

export function CategoriesManager({ initial }: { initial: CategoryRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<CategoryRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  async function seedDefaults() {
    setSeeding(true); setSeedMsg(null);
    const res = await fetch("/api/categories/seed-defaults", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSeeding(false);
    if (res.ok) {
      setSeedMsg(`Added ${data.categoriesCreated ?? 0} categor${data.categoriesCreated === 1 ? "y" : "ies"} · ${data.rulesCreated ?? 0} rule${data.rulesCreated === 1 ? "" : "s"} · auto-categorised ${data.transactionsUpdated ?? 0} txn${data.transactionsUpdated === 1 ? "" : "s"}.`);
      router.refresh();
    } else {
      setSeedMsg(data.error ?? "Seed failed");
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-negative">{error}</p>}
      {seedMsg && <p className="text-xs text-muted">{seedMsg}</p>}

      <div className="flex flex-wrap gap-2 mb-2">
        <Button variant="secondary" onClick={seedDefaults} disabled={seeding}>
          {seeding ? "Seeding…" : "Seed common categories & rules"}
        </Button>
        <p className="text-xs text-muted self-center">
          Adds Groceries, Transport, Subscriptions, Dining, Bills, Salary, …{" "}
          plus matching merchant rules. Safe to re-run; existing rows aren&apos;t touched.
        </p>
      </div>

      {rows.length === 0 && !adding && (
        <p className="text-sm text-muted">No categories yet.</p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="py-2.5">
              {editingId === c.id ? (
                <EditRow row={c}
                  onCancel={() => setEditingId(null)}
                  onSaved={(u) => { setRows((p) => p.map((x) => x.id === u.id ? { ...x, ...u } : x)); setEditingId(null); router.refresh(); }}
                  onError={setError} />
              ) : (
                <DisplayRow row={c}
                  onEdit={() => { setEditingId(c.id); setError(null); }}
                  onDeleted={() => { setRows((p) => p.filter((x) => x.id !== c.id)); router.refresh(); }}
                  onError={setError} />
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddRow
          onCancel={() => setAdding(false)}
          onSaved={(c) => { setRows((p) => [...p, c]); setAdding(false); router.refresh(); }}
          onError={setError}
        />
      ) : (
        <Button variant="secondary" onClick={() => { setAdding(true); setError(null); }}>
          + New category
        </Button>
      )}
    </div>
  );
}

function DisplayRow({ row, onEdit, onDeleted, onError }: {
  row: CategoryRow; onEdit: () => void; onDeleted: () => void; onError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function del() {
    const msg = row.txCount > 0
      ? `Delete "${row.name}"? ${row.txCount} transaction${row.txCount === 1 ? "" : "s"} will become Uncategorized.`
      : `Delete "${row.name}"?`;
    if (!confirm(msg)) return;
    setBusy(true); onError(null);
    const res = await fetch(`/api/categories/${row.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDeleted();
    else onError(data.error ?? "Delete failed");
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm">{row.name}</span>
        <Badge tone={row.kind === "INCOME" ? "positive" : row.kind === "EXPENSE" ? "negative" : "neutral"}>
          {row.kind.toLowerCase()}
        </Badge>
        <span className="text-xs text-muted">{row.txCount} txn</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
        <Button variant="destructive" onClick={del} disabled={busy}>{busy ? "…" : "Delete"}</Button>
      </div>
    </div>
  );
}

function EditRow({ row, onCancel, onSaved, onError }: {
  row: CategoryRow;
  onCancel: () => void;
  onSaved: (r: CategoryRow) => void;
  onError: (s: string | null) => void;
}) {
  const [name, setName] = useState(row.name);
  const [kind, setKind] = useState<CategoryRow["kind"]>(row.kind);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); onError(null);
    const res = await fetch(`/api/categories/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onSaved({ ...row, name, kind });
    else onError(data.error ?? "Save failed");
  }
  return (
    <div className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
      <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <Select value={kind} onChange={(e) => setKind(e.target.value as CategoryRow["kind"])}>
        {KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
      </Select>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "…" : "Save"}</Button>
      </div>
    </div>
  );
}

function AddRow({ onCancel, onSaved, onError }: {
  onCancel: () => void; onSaved: (c: CategoryRow) => void; onError: (s: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryRow["kind"]>("EXPENSE");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); onError(null);
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onSaved({ id: data.id, name, kind, txCount: 0 });
    else onError(data.error ?? "Create failed");
  }
  return (
    <div className="grid grid-cols-[1fr_140px_auto] gap-2 items-center border-t border-border pt-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries, Salary, …" autoFocus />
      <Select value={kind} onChange={(e) => setKind(e.target.value as CategoryRow["kind"])}>
        {KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
      </Select>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "…" : "Create"}</Button>
      </div>
    </div>
  );
}
