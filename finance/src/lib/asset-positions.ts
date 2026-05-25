/**
 * Asset position math: derives current quantity, average cost basis, and
 * realised P/L from the AssetTransaction ledger.
 *
 * Convention:
 *   - BUY, TRANSFER_IN, DIVIDEND (reinvested) -> +quantity
 *   - SELL, TRANSFER_OUT -> -quantity
 *   - SPLIT: quantity field carries the post-split multiplier - 1 of current
 *     holdings (so a 2-for-1 = +1.0 × current). Simple for v1; consider a
 *     dedicated `ratio` column later if real corporate-action support is needed.
 *
 * Cost basis uses a weighted average (simpler than FIFO and good enough for
 * personal-finance reporting). Realised P/L is the sum over SELLs of
 * (sell_price - avg_cost_at_sell_time) × quantity_sold.
 */
import { Decimal } from "decimal.js";

export interface PositionLedgerEntry {
  kind: "BUY" | "SELL" | "DIVIDEND" | "SPLIT" | "TRANSFER_IN" | "TRANSFER_OUT";
  date: Date;
  quantity: Decimal;
  pricePerUnit: Decimal;
  fee?: Decimal | null;
}

export interface PositionSummary {
  quantity: Decimal;       // net units held
  avgCost: Decimal;        // weighted average cost per unit (0 if quantity = 0)
  totalCost: Decimal;      // quantity × avgCost (after the last buy)
  realisedPnl: Decimal;    // cumulative realised P/L
  totalFees: Decimal;
  buys: number;
  sells: number;
}

export function summarisePosition(ledger: PositionLedgerEntry[]): PositionSummary {
  // Process in chronological order — the average-cost method is order-sensitive.
  const sorted = [...ledger].sort((a, b) => a.date.getTime() - b.date.getTime());

  let quantity = new Decimal(0);
  let totalCost = new Decimal(0);
  let realised = new Decimal(0);
  let fees = new Decimal(0);
  let buys = 0;
  let sells = 0;

  for (const e of sorted) {
    if (e.fee) fees = fees.plus(e.fee);

    if (e.kind === "BUY" || e.kind === "TRANSFER_IN" || e.kind === "DIVIDEND") {
      quantity = quantity.plus(e.quantity);
      totalCost = totalCost.plus(e.quantity.mul(e.pricePerUnit));
      if (e.kind === "BUY") buys++;
      continue;
    }
    if (e.kind === "SELL" || e.kind === "TRANSFER_OUT") {
      if (quantity.isZero()) continue;     // can't sell from a zero position
      const avg = totalCost.div(quantity);
      const soldQty = Decimal.min(e.quantity, quantity);
      const gain = e.pricePerUnit.minus(avg).mul(soldQty);
      realised = realised.plus(gain);
      // Reduce holdings + cost basis proportionally.
      totalCost = totalCost.minus(avg.mul(soldQty));
      quantity = quantity.minus(soldQty);
      if (e.kind === "SELL") sells++;
      continue;
    }
    if (e.kind === "SPLIT") {
      // Quantity field is the *additional* units to add (cost basis unchanged).
      quantity = quantity.plus(e.quantity);
      // totalCost unchanged → avgCost rebalances automatically.
      continue;
    }
  }

  const avgCost = quantity.isZero() ? new Decimal(0) : totalCost.div(quantity);
  return {
    quantity,
    avgCost,
    totalCost,
    realisedPnl: realised,
    totalFees: fees,
    buys,
    sells,
  };
}
