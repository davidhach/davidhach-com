"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  email: string;
}

/**
 * Top-right user menu. Two initials avatar (or first email letter) opens a
 * lightweight dropdown with Settings / Security / Sign out. No third-party
 * popover dep — closes on outside click and Escape.
 */
export function ProfileMenu({ email }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    // Hit both endpoints — covers users who came in via password OR magic-link.
    await Promise.allSettled([
      fetch("/api/auth/password/logout", { method: "POST" }),
      fetch("/api/auth/signout", { method: "POST" }),
    ]);
    router.push("/login");
    router.refresh();
  }

  const initial = (email.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="size-8 rounded-full bg-accent/15 text-fg border border-border hover:bg-accent/25 transition flex items-center justify-center text-sm font-medium"
        title={email}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-card overflow-hidden z-20"
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm truncate">{email}</p>
          </div>
          <Link href="/settings" role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-bg">
            Settings
          </Link>
          <Link href="/settings/security" role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-bg">
            Security & 2FA
          </Link>
          <button type="button" role="menuitem"
            onClick={signOut}
            className="block w-full text-left px-3 py-2 text-sm text-negative hover:bg-bg border-t border-border">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
