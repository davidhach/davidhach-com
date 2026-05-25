"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

/** Header action — pulls a live price for every auto-priced asset. */
export function AssetsActions({ hasAssets }: { hasAssets: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refreshAll() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/assets/refresh-all", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`Updated ${data.updated ?? 0} · skipped ${data.skipped ?? 0} · no-quote ${data.noQuote ?? 0} · failed ${data.failed ?? 0}`);
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    } else {
      setMsg("Refresh failed");
    }
  }

  if (!hasAssets) return null;
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <Button variant="secondary" onClick={refreshAll} disabled={busy} title="Pull live prices for all auto-priced assets">
        {busy ? "Refreshing…" : "↻ Refresh prices"}
      </Button>
    </div>
  );
}

/** Per-row controls: edit, refresh / resolve price, or delete (archive) it.
 *  Auto-synced assets (managed = true) hide Edit + Delete — the only way to
 *  remove them is to disconnect the underlying connection. Refresh stays. */
export function AssetRowActions({
  id, name, canRefresh, needsResolve, managed,
}: { id: string; name: string; canRefresh: boolean; needsResolve: boolean; managed?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refresh" | "resolve" | "delete" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy("refresh"); setMsg(null);
    await fetch(`/api/assets/${id}/refresh`, { method: "POST" });
    setBusy(null);
    router.refresh();
  }
  async function resolve() {
    setBusy("resolve"); setMsg(null);
    const res = await fetch(`/api/assets/${id}/resolve`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) router.refresh();
    else setMsg(data.error ?? "Resolve failed");
  }
  async function del() {
    if (!confirm(`Delete "${name}"? Its trade history is kept; the asset is archived from the dashboard.`)) return;
    setBusy("delete");
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert("Delete failed");
  }

  return (
    <div className="inline-flex items-center gap-1">
      {msg && <span className="text-xs text-negative max-w-[180px] truncate" title={msg}>{msg}</span>}
      {!managed && (
        <a href={`/assets/${id}/edit`}
          title="Edit every field of this asset"
          className="px-2 py-1 rounded-md text-xs text-muted hover:bg-bg hover:text-fg">
          Edit
        </a>
      )}
      {needsResolve && (
        <button type="button" onClick={resolve} disabled={busy !== null}
          title="Look up this ISIN and attach a live price source"
          className="px-2 py-1 rounded-md text-xs text-accent hover:bg-bg disabled:opacity-50">
          {busy === "resolve" ? "Resolving…" : "Resolve"}
        </button>
      )}
      {canRefresh && (
        <button type="button" onClick={refresh} disabled={busy !== null}
          title="Pull a live price for this asset"
          className="px-2 py-1 rounded-md text-xs text-muted hover:bg-bg hover:text-fg disabled:opacity-50">
          {busy === "refresh" ? "…" : "↻"}
        </button>
      )}
      {!managed && (
        <button type="button" onClick={del} disabled={busy !== null}
          title="Delete (archive) this asset"
          className="px-2 py-1 rounded-md text-xs text-negative hover:bg-negative/10 disabled:opacity-50">
          {busy === "delete" ? "…" : "Delete"}
        </button>
      )}
      {managed && (
        <span className="text-xs text-muted px-1" title="Auto-synced — disconnect the linked connection to remove">
          🔒
        </span>
      )}
    </div>
  );
}
