"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await signIn("nodemailer", { email, redirect: false, callbackUrl: "/dashboard" });
    setSent(true);
    setSending(false);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-semibold text-xl tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted mt-1">Sign in to your Ledger</p>
        </div>
        {sent ? (
          <p className="text-sm text-muted">Check your email — we've sent you a sign-in link.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <Button type="submit" disabled={sending} className="w-full">
              {sending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
