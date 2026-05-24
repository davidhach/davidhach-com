import { prisma } from "./db";
import { Decimal } from "decimal.js";

const BASE = process.env.FX_BASE ?? "USD";

interface RatesPayload {
  base: string;
  date: string; // YYYY-MM-DD
  rates: Record<string, number>;
}

/** Fetch latest rates from exchangerate.host (free, no key) and cache in DB. */
export async function refreshFxRates(forDate?: Date): Promise<number> {
  const date = forDate ?? new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const url = `https://api.exchangerate.host/${dateStr}?base=${encodeURIComponent(BASE)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const payload = (await res.json()) as RatesPayload;
  const entries = Object.entries(payload.rates ?? {});
  await prisma.$transaction(
    entries.map(([quote, rate]) =>
      prisma.fxRate.upsert({
        where: { date_base_quote: { date: new Date(dateStr), base: BASE, quote } },
        create: { date: new Date(dateStr), base: BASE, quote, rate: new Decimal(rate), source: "exchangerate.host" },
        update: { rate: new Decimal(rate), source: "exchangerate.host" },
      }),
    ),
  );
  return entries.length;
}

/**
 * Convert an amount from `from` to `to` as of `date`.
 * Falls back to the most recent rate prior to `date` if the exact day isn't cached.
 */
export async function convert(args: {
  amount: Decimal | string | number;
  from: string;
  to: string;
  date: Date;
}): Promise<Decimal> {
  const amt = new Decimal(args.amount);
  if (args.from === args.to) return amt;

  const day = new Date(args.date.toISOString().slice(0, 10));
  const fromRate = args.from === BASE ? new Decimal(1) : await rateAt(args.from, day);
  const toRate = args.to === BASE ? new Decimal(1) : await rateAt(args.to, day);
  if (!fromRate || !toRate) {
    throw new Error(`Missing FX rate for ${args.from}→${args.to} on ${day.toISOString().slice(0, 10)}`);
  }
  // amt is in `from`. Convert to base, then to target.
  const inBase = amt.div(fromRate);
  return inBase.mul(toRate);
}

async function rateAt(quote: string, date: Date): Promise<Decimal | null> {
  const row = await prisma.fxRate.findFirst({
    where: { quote, date: { lte: date }, base: BASE },
    orderBy: { date: "desc" },
  });
  return row ? new Decimal(row.rate.toString()) : null;
}
