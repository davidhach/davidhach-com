"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Range = "1D" | "7D" | "1M" | "3M" | "12M" | "custom";
type Scope = "total" | "entity" | "assetClass";

interface SeriesPoint { date: string; value: number }
interface SeriesResp { series: SeriesPoint[]; currency: string; resolution: "daily" | "monthly" }

interface ScopeOption { value: string; label: string }

interface Props {
  initialData: SeriesPoint[];
  initialCurrency: string;
  entities: ScopeOption[];      // {value=entityId, label=name}
  assetClasses: ScopeOption[];  // {value="STOCKS", label="Stocks"}
}

const RANGES: Range[] = ["1D", "7D", "1M", "3M", "12M"];

export function NetWorthChart({ initialData, initialCurrency, entities, assetClasses }: Props) {
  const [range, setRange] = useState<Range>("12M");
  const [scope, setScope] = useState<Scope>("total");
  const [scopeId, setScopeId] = useState<string>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<SeriesPoint[]>(initialData);
  const [currency, setCurrency] = useState(initialCurrency);
  const [loading, setLoading] = useState(false);

  // Fetch whenever filters change (skip the very first render — we have SSR data).
  const first = useFirstRender();
  useEffect(() => {
    if (first) return;
    const ac = new AbortController();
    void (async () => {
      setLoading(true);
      const p = new URLSearchParams({ range });
      if (range === "custom" && customFrom && customTo) {
        p.set("from", customFrom); p.set("to", customTo);
      }
      if (scope !== "total" && scopeId) {
        p.set("scope", scope); p.set("scopeId", scopeId);
      }
      try {
        const res = await fetch(`/api/snapshots?${p}`, { signal: ac.signal });
        if (res.ok) {
          const json = (await res.json()) as SeriesResp;
          setData(json.series);
          setCurrency(json.currency);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [range, scope, scopeId, customFrom, customTo, first]);

  const scopeOptions = scope === "entity" ? entities : scope === "assetClass" ? assetClasses : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button"
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-md ${range === r ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
              {r}
            </button>
          ))}
          <button type="button" onClick={() => setRange("custom")}
            className={`px-2.5 py-1 rounded-md ${range === "custom" ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
            Custom
          </button>
        </div>

        {range === "custom" && (
          <div className="flex items-center gap-1">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1" />
            <span className="text-muted">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1" />
          </div>
        )}

        <select value={scope}
          onChange={(e) => { setScope(e.target.value as Scope); setScopeId(""); }}
          className="bg-card border border-border rounded-md px-2 py-1">
          <option value="total">Total</option>
          {entities.length > 0 && <option value="entity">By entity</option>}
          {assetClasses.length > 0 && <option value="assetClass">By class</option>}
        </select>

        {scope !== "total" && (
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}
            className="bg-card border border-border rounded-md px-2 py-1 min-w-[120px]">
            <option value="">Choose…</option>
            {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {loading && <span className="text-muted">Loading…</span>}
      </div>

      <Chart data={data} currency={currency} />
    </div>
  );
}

function Chart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  const fmt = useMemo(
    () => (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n),
    [currency],
  );
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor"
            tickFormatter={(d: string) => d.length >= 7 ? d.slice(0, 7) : d} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [fmt(v), "Value"]}
            labelFormatter={(l) => l}
          />
          <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} fill="url(#nwGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function useFirstRender(): boolean {
  const [first, setFirst] = useState(true);
  useEffect(() => { setFirst(false); }, []);
  return first;
}
