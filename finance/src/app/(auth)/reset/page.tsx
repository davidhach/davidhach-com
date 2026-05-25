"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const userId = params.get("u") ?? "";
  const hasToken = !!token && !!userId;

  const [email, setEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setDone(true);
    setBusy(false);
  }

  async function confirmReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId, newPassword: newPw }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) window.location.href = "/dashboard";
    else setError(data.error ?? "Reset failed");
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="font-semibold text-xl tracking-tight text-center mb-6">
          {hasToken ? "Set a new password" : "Reset your password"}
        </h1>
        {error && (
          <div className="mb-4 text-sm text-negative border border-negative/20 bg-negative/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {hasToken ? (
          <form onSubmit={confirmReset} className="space-y-4">
            <div>
              <Label htmlFor="newpw">New password</Label>
              <Input id="newpw" type="password" required minLength={12} value={newPw}
                onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-muted mt-1">≥ 12 chars, mix of 3 of: lower, upper, digit, symbol.</p>
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        ) : done ? (
          <p className="text-sm text-muted">
            If that email is registered, a reset link is on its way. The link is valid for 30 minutes.
          </p>
        ) : (
          <form onSubmit={requestReset} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
