/**
 * Bulk historical valuation entry.
 *
 *   POST /api/valuations/bulk
 *   { date: "YYYY-MM-DD",
 *     entries: [{ assetId, value, currency?, quantity? }, ...] }
 *
 * Behaviour:
 *   - Creates one Valuation row per non-empty entry (source = MANUAL).
 *   - Does NOT touch prior Valuation rows — historical entries are immutable.
 *   - Updates Asset.currentValue ONLY when the entry's date is the most recent
 *     valuation for that asset (so backfilling old dates doesn't move the
 *     denormalised cache backward).
 *   - Authorises every assetId belongs to the caller before writing.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { handle, ok, parseBody, err } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { isoDate, moneyString, currency } from "@/lib/validation";

const bulkInput = z.object({
  date: isoDate,
  entries: z.array(z.object({
    assetId: z.string().cuid(),
    value: moneyString,
    currency: currency.optional(),
    quantity: moneyString.optional(),
    note: z.string().max(200).optional(),
  })).min(1).max(500),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const data = await parseBody(req, bulkInput);
    const date = new Date(data.date);

    const ids = data.entries.map((e) => e.assetId);
    const assets = await prisma.asset.findMany({
      where: { id: { in: ids }, userId, archived: false },
      select: { id: true, currency: true, quantity: true },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    if (byId.size !== new Set(ids).size) {
      return err("One or more assets not found", 404);
    }

    // For "is this the latest valuation?" check.
    const latest = new Map(
      (
        await prisma.valuation.groupBy({
          by: ["assetId"],
          where: { userId, assetId: { in: ids } },
          _max: { date: true },
        })
      ).map((g) => [g.assetId!, g._max.date as Date | null]),
    );

    const writes = data.entries.flatMap((e) => {
      const asset = byId.get(e.assetId)!;
      const ccy = e.currency ?? asset.currency;
      const ops = [
        prisma.valuation.create({
          data: {
            userId,
            assetId: e.assetId,
            date,
            value: e.value,
            quantity: e.quantity ?? asset.quantity ?? null,
            currency: ccy,
            source: "MANUAL",
            note: e.note,
          },
        }),
      ];
      const prevLatest = latest.get(e.assetId) ?? null;
      if (!prevLatest || date >= prevLatest) {
        ops.push(
          prisma.asset.update({
            where: { id: e.assetId },
            data: { currentValue: e.value, currency: ccy },
          }),
        );
      }
      return ops;
    });

    await prisma.$transaction(writes);
    await recordAudit({
      userId,
      action: "valuation.bulk",
      after: { date: data.date, count: data.entries.length },
      req,
    });

    return ok({ inserted: data.entries.length, date: data.date }, { status: 201 });
  });
}
