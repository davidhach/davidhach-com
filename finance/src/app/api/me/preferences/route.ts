/**
 * User preferences: currently just displayCurrency + locale.
 * Display-currency string is validated against the server-side allowlist
 * in src/lib/currencies.ts — never trust the picker.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { isSupportedCurrency } from "@/lib/currencies";
import { z } from "zod";

const preferencesInput = z.object({
  displayCurrency: z.string().length(3).toUpperCase().refine(isSupportedCurrency, "Unsupported currency").optional(),
  locale: z.string().min(2).max(10).optional(),
});

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, preferencesInput);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayCurrency: true, locale: true },
    });
    const after = await prisma.user.update({
      where: { id: userId },
      data,
      select: { displayCurrency: true, locale: true },
    });
    await recordAudit({ userId, action: "user.preferences.update", before, after, req });
    return ok(after);
  });
}
