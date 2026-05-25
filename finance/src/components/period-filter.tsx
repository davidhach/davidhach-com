"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = ["1m", "3m", "6m", "12m", "ytd", "custom"] as const;
export type PeriodPreset = (typeof PRESETS)[number];
const LABEL: Record<PeriodPreset, string> = {
  "1m": "1M", "3m": "3M", "6m": "6M", "12m": "12M", ytd: "YTD", custom: "Custom",
};

/**
 * Compact period selector with presets + a custom date-range pair. Mirrors the
 * dashboard NetWorthChart's range UX so it feels native here. Pushes
 * ?period=…&from=…&to=… into the URL — the server reads + validates.
 */
export function PeriodFilter({ current, customFrom, customTo }: {
  current: PeriodPreset;
  customFrom?: string;
  customTo?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(customFrom ?? "");
  const [to, setTo] = useState(customTo ?? "");

  function update(next: Partial<{ period: PeriodPreset; from: string; to: string }>) {
    const q = new URLSearchParams(params);
    if (next.period) q.set("period", next.period);
    if (next.period && next.period !== "custom") { q.delete("from"); q.delete("to"); }
    if (next.from !== undefined) { if (next.from) q.set("from", next.from); else q.delete("from"); }
    if (next.to   !== undefined) { if (next.to)   q.set("to",   next.to);   else q.delete("to"); }
    router.push(`?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {PRESETS.map((p) => (
          <button key={p} type="button"
            onClick={() => update({ period: p })}
            className={`px-2.5 py-1 rounded-md ${current === p ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
            {LABEL[p]}
          </button>
        ))}
      </div>
      {current === "custom" && (
        <div className="flex items-center gap-1">
          <input type="date" value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={() => update({ from })}
            className="bg-card border border-border rounded-md px-2 py-1" />
          <span className="text-muted">→</span>
          <input type="date" value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={() => update({ to })}
            className="bg-card border border-border rounded-md px-2 py-1" />
        </div>
      )}
    </div>
  );
}
