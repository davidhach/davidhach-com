import { prisma } from "./db";
import type { NextRequest } from "next/server";

export interface AuditInput {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  req?: NextRequest | Request | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const headers = input.req?.headers;
  const ip =
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers?.get("x-real-ip") ??
    null;
  const userAgent = headers?.get("user-agent") ?? null;

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      actor: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
      ip,
      userAgent,
    },
  });
}
