import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StatementReview } from "@/components/statement-review";
import { Card, Badge, Button } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function StatementDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await requireUserId();
  const upload = await prisma.statementUpload.findFirst({
    where: { id, userId },
    include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 }, finAccount: true },
  });
  if (!upload) notFound();

  const extraction = upload.extractions[0];
  const transactions = extraction
    ? await prisma.transaction.findMany({
        where: { ocrExtractionId: extraction.id, status: "REVIEW" },
        include: { category: true },
        orderBy: { date: "asc" },
      })
    : [];

  const warnings = ((extraction?.warnings as string[] | null) ?? []) as string[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{upload.fileName}</h1>
          <p className="text-xs text-muted mt-1">
            Uploaded {upload.uploadedAt.toISOString().slice(0, 16).replace("T", " ")} · {upload.finAccount?.name ?? "no account"}
          </p>
        </div>
        <Badge tone={upload.status === "COMPLETED" ? "positive" : upload.status === "REVIEW" ? "warning" : "neutral"}>
          {upload.status.toLowerCase()}
        </Badge>
      </header>

      {upload.status === "FAILED" && (
        <Card className="border-negative/40 bg-negative/5">
          <p className="text-sm">{upload.errorMessage ?? "OCR failed."}</p>
          <form action={`/api/statements/${upload.id}/parse`} method="post" className="mt-3">
            <Button type="submit" variant="secondary">Retry</Button>
          </form>
        </Card>
      )}

      {upload.status === "COMPLETED" && (
        <Card>
          <p className="text-sm text-muted">This statement has been processed.</p>
        </Card>
      )}

      {transactions.length > 0 && upload.status === "REVIEW" && (
        <StatementReview
          statementId={upload.id}
          warnings={warnings}
          overallConfidence={extraction?.confidence ?? null}
          initialTransactions={transactions.map((t) => ({
            id: t.id,
            date: t.date.toISOString().slice(0, 10),
            description: t.description,
            merchant: t.merchant,
            amount: t.amount.toString(),
            currency: t.currency,
            categoryId: t.categoryId,
            category: t.category ? { id: t.category.id, name: t.category.name } : null,
            confidence: t.confidence,
            duplicateOfId: t.duplicateOfId,
            finAccountId: t.finAccountId,
          }))}
        />
      )}
    </div>
  );
}
