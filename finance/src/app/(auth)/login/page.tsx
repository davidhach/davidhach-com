"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

type Mode = "password" | "totp" | "magic";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.totpRequired) {
        setMode("totp");
      } else if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setError(data.error ?? "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(useRecovery ? { recoveryCode: recovery } : { totp }),
        }),
      });
      const data = await res.json();
      if (res.ok) window.location.href = "/dashboard";
      else setError(data.error ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await signIn("nodemailer", { email, redirect: false, callbackUrl: "/dashboard" });
    setMagicSent(true);
    setBusy(false);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-semibold text-xl tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted mt-1">Sign in to your Ledger</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-negative border border-negative/20 bg-negative/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {mode === "password" && (
          <form onSubmit={submitPassword} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <div className="flex justify-between text-xs text-muted">
              <button type="button" className="underline" onClick={() => setMode("magic")}>
                Use email link instead
              </button>
              <a href="/reset" className="underline">Forgot password?</a>
            </div>
          </form>
        )}

        {mode === "totp" && (
          <form onSubmit={submitTotp} className="space-y-4">
            <p className="text-sm text-muted">
              Enter the 6-digit code from your authenticator app
              {useRecovery ? " or a recovery code" : ""}.
            </p>
            {useRecovery ? (
              <div>
                <Label htmlFor="rc">Recovery code</Label>
                <Input id="rc" required value={recovery}
                  onChange={(e) => setRecovery(e.target.value)} autoComplete="one-time-code" />
              </div>
            ) : (
              <div>
                <Label htmlFor="totp">Authentication code</Label>
                <Input id="totp" inputMode="numeric" pattern="\d{6}" maxLength={6}
                  required value={totp} onChange={(e) => setTotp(e.target.value)}
                  autoComplete="one-time-code" autoFocus />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <button type="button" className="text-xs text-muted underline"
              onClick={() => setUseRecovery((v) => !v)}>
              {useRecovery ? "Use authenticator code" : "Use a recovery code"}
            </button>
          </form>
        )}

        {mode === "magic" && (
          magicSent ? (
            <p className="text-sm text-muted">Check your email — we've sent you a sign-in link.</p>
          ) : (
            <form onSubmit={submitMagic} className="space-y-4">
              <div>
                <Label htmlFor="email2">Email</Label>
                <Input id="email2" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send magic link"}
              </Button>
              <button type="button" className="text-xs text-muted underline w-full text-center"
                onClick={() => setMode("password")}>
                Back to password sign-in
              </button>
            </form>
          )
        )}
      </Card>
    </div>
  );
}
