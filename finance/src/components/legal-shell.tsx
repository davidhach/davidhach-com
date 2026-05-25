import Link from "next/link";

/**
 * Public shell for /privacy and /terms. Renders without auth so prospective
 * users (and the Enable Banking compliance review) can read the legal pages
 * without needing to sign in.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-sm tracking-tight">Ledger</Link>
          <nav className="flex items-center gap-3 text-sm text-muted">
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/terms"   className="hover:text-fg">Terms</Link>
            <Link href="/login"   className="hover:text-fg">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 flex-1 w-full">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">{title}</h1>
        <p className="text-xs text-muted mb-8">Effective {updated}</p>
        <article className="legal-prose text-sm leading-6 space-y-3">
          {children}
        </article>
      </main>
      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 text-xs text-muted flex items-center justify-between">
          <span>© Ledger</span>
          <nav className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/terms"   className="hover:text-fg">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
