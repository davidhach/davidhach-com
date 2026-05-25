import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/primitives";
import { NewBankClient } from "./client";

export const dynamic = "force-dynamic";

export default async function NewBankPage() {
  const userId = await requireUserId();
  const finAccounts = await prisma.finAccount.findMany({
    where: { userId, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, currency: true, kind: true },
  });
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Connect an account</h1>
      <Card>
        <NewBankClient finAccounts={finAccounts} />
      </Card>
    </div>
  );
}
