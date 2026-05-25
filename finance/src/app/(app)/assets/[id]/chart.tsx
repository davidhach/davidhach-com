"use client";
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point { date: string; value: number; quantity: number; price?: number }

export function AssetHistoryChart({ assetId, currency }: { assetId: string; currency: string }) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assets/${assetId}/history?days=365`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.series) setData(j.series); })
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return <p className="text-xs text-muted">Loading…</p>;
  if (data.length < 2) {
    return <p className="text-xs text-muted">No price history yet. The daily cron will start populating it.</p>;
  }
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="hist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor"
            tickFormatter={(d: string) => d.slice(0, 7)} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="currentColor"
            tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [fmt(v), "Value"]} />
          <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} fill="url(#hist)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
