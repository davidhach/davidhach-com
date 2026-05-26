"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

interface Props {
  /** Most recent of: latest Asset.lastPricedAt, latest BankConnection.lastSyncedAt, latest FxRate.date.
   *  Used to render "Last refreshed: 4h ago" before the user clicks. */
  lastRefreshedAt: string | null;
}

interface RefreshResult {
  ok: boolean;
  fx: { ok: boolean; count: number; error: string | null };
  prices: { considered: number; updated: number; noQuote: number; failed: number; error: string | null };
  banks: { ok: number; failed: number; consentExpired: number; total: number };
  refreshedAt: string;
  durationMs: number;
}

/** Dashboard refresh: re-pull FX + per-user asset prices + per-user bank syncs,
 *  then re-render the page. Mirrors what the daily cron does for ONE user. */
export function DashboardRefresh({ lastRefreshedAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(lastRefreshedAt);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true); setError(null); setSummary(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RefreshResult;
      setLast(data.refreshedAt);
      const bits = [
        `FX ${data.fx.ok ? data.fx.count : "✗"}`,
        `prices ${data.prices.updated}/${data.prices.considered}`,
        `banks ${data.banks.ok}/${data.banks.total}`,
      ];
      setSummary(bits.join(" · "));
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message || "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  const ago = last ? formatDistanceToNow(new Date(last), { addSuffix: true }) : "never";
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={busy || pending}
        className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg/50 hover:bg-bg disabled:opacity-50"
        title="Re-pull FX rates, asset prices, and connected bank balances"
      >
        {busy ? "Refreshing…" : pending ? "Updating…" : "↻ Refresh"}
      </button>
      <div className="text-[11px] text-muted tnum">
        {error ? <span className="text-yellow-700">⚠ {error}</span> : summary ? summary : `Last refreshed ${ago}`}
      </div>
    </div>
  );
}
