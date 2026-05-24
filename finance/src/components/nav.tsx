"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/assets", label: "Assets" },
  { href: "/liabilities", label: "Liabilities" },
  { href: "/accounts", label: "Accounts" },
  { href: "/spending", label: "Spending" },
  { href: "/statements", label: "Statements" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-1">
        <Link href="/dashboard" className="font-semibold text-sm tracking-tight mr-4">
          Ledger
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition whitespace-nowrap",
                pathname.startsWith(it.href) ? "bg-bg text-fg" : "text-muted hover:text-fg",
              )}
            >
              {it.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
