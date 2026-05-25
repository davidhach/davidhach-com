"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui/primitives";

interface Account { externalId: string; iban?: string; currency: string; name: string }
interface FinAccount { id: string; name: string; currency: string }

export function LinkClient({
  connectionId, provider, finAccounts,
}: { connectionId: string; provider: string; finAccounts: FinAccount[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({}); // externalId -> finAccountId ("" = skip)
  const [busy, setBusy] = useState(false);

  // Endpoint set varies by provider — both EnableBanking (current) and
  // GoCardless (legacy) connections may exist.
  const accountsUrl =
    provider === "enablebanking"
      ? `/api/banks/enablebanking/accounts?connectionId=${connectionId}`
      : `/api/banks/gocardless/accounts?connectionId=${connectionId}`;
  const linkUrl =
    provider === "enablebanking" ? "/api/banks/enablebanking/link" : "/api/banks/gocardless/link";

  useEffect(() => {
    fetch(accountsUrl)
      .then(async (r) => r.ok ? r.json() : Promise.reject((await r.json()).error))
      .then((d) => setAccounts(d.accounts))
      .catch((e) => setError(typeof e === "string" ? e : "Failed"));
  }, [accountsUrl]);

  async function save() {
    if (!accounts) return;
    setBusy(true); setError(null);
    const links = accounts
      .filter((a) => picks[a.externalId])
      .map((a) => ({
        externalId: a.externalId,
        finAccountId: picks[a.externalId],
        iban: a.iban,
        currency: a.currency,
      }));
    if (links.length === 0) { setError("Pick at least one account to link."); setBusy(false); return; }
    const res = await fetch(linkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, links }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push("/settings/banks");
    else setError(data.error ?? "Failed");
  }

  if (error) return <p className="text-sm text-negative">{error}</p>;
  if (!accounts) return <p className="text-sm text-muted">Loading accounts…</p>;
  if (accounts.length === 0) return <p className="text-sm text-muted">No accounts returned by the bank.</p>;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border border border-border rounded-xl">
        {accounts.map((a) => (
          <li key={a.externalId} className="grid grid-cols-[1fr_220px] gap-3 items-center px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm">{a.name}</div>
              <div className="text-xs text-muted truncate">
                {a.iban ?? a.externalId} · {a.currency}
              </div>
            </div>
            <Select value={picks[a.externalId] ?? ""}
              onChange={(e) => setPicks((p) => ({ ...p, [a.externalId]: e.target.value }))}>
              <option value="">Don&apos;t link</option>
              {finAccounts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <Button onClick={save} disabled={busy}>{busy ? "Linking…" : "Link & sync"}</Button>
    </div>
  );
}
