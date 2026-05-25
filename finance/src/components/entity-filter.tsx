"use client";
import { useRouter, useSearchParams } from "next/navigation";

interface Entity { id: string; name: string }

/**
 * Compact entity picker that pushes ?entity=<id> into the URL. The dashboard
 * server component reads the param and re-runs its SSR queries scoped to that
 * entity. "All" clears the param.
 */
export function EntityFilter({ entities, current }: { entities: Entity[]; current: string | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function pick(next: string) {
    const q = new URLSearchParams(params);
    if (next) q.set("entity", next); else q.delete("entity");
    router.push(`?${q.toString()}`);
  }

  if (entities.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted">Entity:</span>
      <select
        value={current ?? ""}
        onChange={(e) => pick(e.target.value)}
        className="bg-card border border-border rounded-md px-2 py-1"
      >
        <option value="">All</option>
        {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
}
