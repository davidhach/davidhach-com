"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Select } from "@/components/ui/primitives";

interface Account { id: string; name: string; institution: string | null }

export function StatementUploader({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "uploading" | "parsing">("");
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy("uploading");
    const fd = new FormData();
    fd.append("file", file);
    if (accountId) fd.append("finAccountId", accountId);
    const upRes = await fetch("/api/statements", { method: "POST", body: fd });
    if (!upRes.ok) {
      const e = await upRes.json().catch(() => ({}));
      setError(e.error ?? "Upload failed");
      setBusy("");
      return;
    }
    const upload = await upRes.json();
    setBusy("parsing");
    const parseRes = await fetch(`/api/statements/${upload.id}/parse`, { method: "POST" });
    if (!parseRes.ok) {
      const e = await parseRes.json().catch(() => ({}));
      setError(e.error ?? "Parse failed");
      setBusy("");
      return;
    }
    router.push(`/statements/${upload.id}`);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted block mb-1.5">Account (optional)</label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— Choose during review —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ""}</option>)}
            </Select>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy === "uploading" ? "Uploading…" : busy === "parsing" ? "Reading with Claude…" : "Upload screenshot"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onChange}
          />
        </div>
        <p className="text-xs text-muted">
          PNG, JPEG, or WebP, up to 8&nbsp;MB. Files are AES-256-GCM encrypted before they leave the server.
        </p>
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </Card>
  );
}
