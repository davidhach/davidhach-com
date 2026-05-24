"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function NetWorthChart({ data, currency }: { data: { date: string; netWorth: number }[]; currency: string }) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
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
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" tickFormatter={(d) => d.slice(0, 7)} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [fmt(v), "Net worth"]}
            labelFormatter={(l) => l}
          />
          <Area type="monotone" dataKey="netWorth" stroke="currentColor" strokeWidth={2} fill="url(#nwGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
