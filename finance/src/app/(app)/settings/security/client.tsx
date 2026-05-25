"use client";
import { useState } from "react";
import { Button, Input, Label, Badge } from "@/components/ui/primitives";

interface Props {
  hasPassword: boolean;
  totpEnabled: boolean;
  remainingRecovery: number;
}

export function SecurityClient({ hasPassword, totpEnabled, remainingRecovery }: Props) {
  return (
    <div className="space-y-6">
      <PasswordSection hasPassword={hasPassword} />
      <TotpSection totpEnabled={totpEnabled} remainingRecovery={remainingRecovery} hasPassword={hasPassword} />
    </div>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/password/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPassword: next,
        ...(hasPassword ? { currentPassword: current } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ tone: "ok", text: hasPassword ? "Password changed." : "Password set." });
      setCurrent(""); setNext("");
    } else {
      setMsg({ tone: "err", text: data.error ?? "Failed" });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {hasPassword && (
        <div>
          <Label htmlFor="cur">Current password</Label>
          <Input id="cur" type="password" required value={current}
            onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
      )}
      <div>
        <Label htmlFor="new">{hasPassword ? "New password" : "Choose a password"}</Label>
        <Input id="new" type="password" required minLength={12} value={next}
          onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <p className="text-xs text-muted mt-1">≥ 12 chars, 3 of: lower, upper, digit, symbol.</p>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </Button>
      {msg && (
        <p className={`text-xs ${msg.tone === "ok" ? "text-positive" : "text-negative"}`}>{msg.text}</p>
      )}
    </form>
  );
}

function TotpSection({ totpEnabled, remainingRecovery, hasPassword }: {
  totpEnabled: boolean; remainingRecovery: number; hasPassword: boolean;
}) {
  const [enrollment, setEnrollment] = useState<{ otpauthUrl: string; secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function beginEnroll() {
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/totp/enroll", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setEnrollment(data); else setError(data.error ?? "Failed");
  }
  async function confirm() {
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/totp/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) { setRecovery(data.recoveryCodes); setEnrollment(null); setCode(""); }
    else setError(data.error ?? "Failed");
  }
  async function disable() {
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/totp/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePw }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) { window.location.reload(); }
    else setError(data.error ?? "Failed");
  }

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Two-factor authentication (TOTP)</h3>
        {totpEnabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}
      </div>

      {error && <p className="text-xs text-negative">{error}</p>}

      {!totpEnabled && !enrollment && !recovery && (
        <>
          {!hasPassword && (
            <p className="text-xs text-muted">Set a password first to enable TOTP.</p>
          )}
          <Button onClick={beginEnroll} disabled={busy || !hasPassword} variant="secondary">
            {busy ? "…" : "Enable TOTP"}
          </Button>
        </>
      )}

      {enrollment && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Scan this QR with Google Authenticator, 1Password, Authy, or any TOTP app.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div
              className="bg-white rounded-lg p-2 shrink-0"
              // Server-rendered SVG of the otpauth:// URL, no untrusted HTML.
              dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
            />
            <div className="space-y-2 min-w-0 flex-1">
              <div>
                <p className="text-xs text-muted mb-1">Can't scan? Type this secret instead:</p>
                <code className="block text-xs bg-bg p-2 rounded border border-border break-all">
                  {enrollment.secret}
                </code>
              </div>
              <div>
                <Label htmlFor="totp-confirm">Code from app</Label>
                <Input id="totp-confirm" inputMode="numeric" pattern="\d{6}" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </div>
              <Button onClick={confirm} disabled={busy || code.length !== 6}>
                {busy ? "…" : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {recovery && (
        <div className="space-y-2">
          <p className="text-sm">
            TOTP enabled. <strong>Save these recovery codes now</strong> — they will not be shown again:
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm bg-bg p-3 rounded border border-border">
            {recovery.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {totpEnabled && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{remainingRecovery} recovery codes remaining.</p>
          <Label htmlFor="dispw">Password to disable</Label>
          <Input id="dispw" type="password" value={disablePw}
            onChange={(e) => setDisablePw(e.target.value)} autoComplete="current-password" />
          <Button onClick={disable} disabled={busy || !disablePw} variant="destructive">
            {busy ? "…" : "Disable TOTP"}
          </Button>
        </div>
      )}
    </div>
  );
}
