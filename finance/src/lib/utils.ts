import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Decimal } from "decimal.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: Decimal | string | number, currency = "USD", locale = "en-US"): string {
  const n = new Decimal(value).toNumber();
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(fractionDigits)}%`;
}

export function pctChange(before: Decimal | string | number, after: Decimal | string | number): number {
  const b = new Decimal(before);
  const a = new Decimal(after);
  if (b.isZero()) return a.isZero() ? 0 : Infinity;
  return a.minus(b).div(b).toNumber();
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
