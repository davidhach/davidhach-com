import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui/primitives";
import { StatementUploader } from "@/components/statement-uploader";

export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const userId = await requireUserId();
  const [accounts, uploads] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId, archived: false }, orderBy: { name: "asc" } }),
    prisma.statementUpload.findMany({
      where: { userId },
      orderBy: { uploadedAt: "desc" },
      take: 50,
      include: { finAccount: true, _count: { select: { extractions: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        <p className="text-sm text-muted mt-1">Upload a screenshot — we'll extract the transactions for you to review.</p>
      </header>

      <StatementUploader accounts={accounts.map((a) => ({ id: a.id, name: a.name, institution: a.institution }))} />

      <Card className="p-0 overflow-hidden">
        {uploads.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted">No uploads yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg/50 text-xs text-muted">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">File</th>
                <th className="text-left font-medium px-4 py-2.5">Account</th>
                <th className="text-left font-medium px-4 py-2.5">Uploaded</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {uploads.map((u) => (
                <tr key={u.id} className="hover:bg-bg/40">
                  <td className="px-4 py-3">
                    <Link href={`/statements/${u.id}`} className="font-medium hover:underline">{u.fileName}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{u.finAccount?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{u.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETED" ? "positive" :
    status === "REVIEW" ? "warning" :
    status === "FAILED" ? "negative" : "neutral";
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}
