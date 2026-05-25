"use client";
import { useState } from "react";
import { Select } from "@/components/ui/primitives";
import { DISPLAY_CURRENCIES } from "@/lib/currencies";

export function CurrencyPicker({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function change(next: string) {
    setValue(next);
    setState("saving");
    const res = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayCurrency: next }),
    });
    if (res.ok) {
      setState("saved");
      // Re-render every page that depends on displayCurrency (dashboard, spending, …).
      window.location.reload();
    } else {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onChange={(e) => change(e.target.value)} className="max-w-[180px]">
        {DISPLAY_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
        ))}
      </Select>
      {state === "saving" && <span className="text-xs text-muted">Saving…</span>}
      {state === "error"  && <span className="text-xs text-negative">Failed</span>}
    </div>
  );
}
