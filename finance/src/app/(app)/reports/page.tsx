import Link from "next/link";
import { Card, Button } from "@/components/ui/primitives";

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-medium text-sm">Net worth over time</h2>
          <p className="text-xs text-muted mt-1">Shown on the dashboard.</p>
          <div className="mt-3"><Link href="/dashboard"><Button variant="secondary">Open</Button></Link></div>
        </Card>
        <Card>
          <h2 className="font-medium text-sm">Spending breakdown</h2>
          <p className="text-xs text-muted mt-1">Category, merchant, month.</p>
          <div className="mt-3"><Link href="/spending"><Button variant="secondary">Open</Button></Link></div>
        </Card>
        <Card>
          <h2 className="font-medium text-sm">Full data export</h2>
          <p className="text-xs text-muted mt-1">One JSON file with everything you own.</p>
          <div className="mt-3"><a href="/api/export"><Button variant="secondary">Download</Button></a></div>
        </Card>
      </div>
    </div>
  );
}
