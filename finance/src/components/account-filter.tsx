"use client";
import { useRouter, useSearchParams } from "next/navigation";

interface Account { id: string; name: string }

/** Same shape as EntityFilter — pushes ?account=<id> into the URL. */
export function AccountFilter({ accounts, current }: { accounts: Account[]; current: string | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function pick(next: string) {
    const q = new URLSearchParams(params);
    if (next) q.set("account", next); else q.delete("account");
    router.push(`?${q.toString()}`);
  }

  if (accounts.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted">Account:</span>
      <select
        value={current ?? ""}
        onChange={(e) => pick(e.target.value)}
        className="bg-card border border-border rounded-md px-2 py-1"
      >
        <option value="">All</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}
