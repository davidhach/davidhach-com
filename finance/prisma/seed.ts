/**
 * Seed: one demo user with two entities, a handful of accounts, assets,
 * liabilities, and 12 months of monthly snapshots so the dashboard has a chart.
 */
import { PrismaClient } from "@prisma/client";
import { subMonths, startOfMonth } from "date-fns";
import { Decimal } from "decimal.js";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@ledger.local";
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Demo", displayCurrency: "USD" },
    update: {},
  });

  // Categories
  const expenseCats = ["Groceries", "Restaurants", "Coffee", "Transport", "Rent", "Utilities", "Subscriptions", "Health", "Travel", "Shopping"];
  const incomeCats = ["Salary", "Dividends", "Refund"];
  for (const name of expenseCats) {
    await prisma.category.upsert({
      where: { userId_name_kind: { userId: user.id, name, kind: "EXPENSE" } },
      create: { userId: user.id, name, kind: "EXPENSE" },
      update: {},
    });
  }
  for (const name of incomeCats) {
    await prisma.category.upsert({
      where: { userId_name_kind: { userId: user.id, name, kind: "INCOME" } },
      create: { userId: user.id, name, kind: "INCOME" },
      update: {},
    });
  }

  const personal = await prisma.entity.upsert({
    where: { id: `${user.id}-personal` }, // synthetic stable id won't match; create explicitly
    create: { id: `${user.id}-personal`, userId: user.id, name: "Personal", kind: "PERSONAL", currency: "USD" },
    update: {},
  }).catch(async () => {
    const e = await prisma.entity.findFirst({ where: { userId: user.id, name: "Personal" } });
    return e ?? prisma.entity.create({ data: { userId: user.id, name: "Personal", kind: "PERSONAL", currency: "USD" } });
  });

  const company = await prisma.entity.findFirst({ where: { userId: user.id, name: "Company" } })
    ?? await prisma.entity.create({ data: { userId: user.id, name: "Company", kind: "COMPANY", currency: "USD" } });

  const checking = await ensureAccount(user.id, personal.id, { name: "Chase Checking", institution: "Chase", kind: "CHECKING" });
  const brokerage = await ensureAccount(user.id, personal.id, { name: "IBKR Brokerage", institution: "Interactive Brokers", kind: "BROKERAGE" });
  const card = await ensureAccount(user.id, personal.id, { name: "Amex Gold", institution: "American Express", kind: "CREDIT_CARD" });
  const corpCash = await ensureAccount(user.id, company.id, { name: "Mercury Operating", institution: "Mercury", kind: "CHECKING" });

  // Assets
  await ensureAsset(user.id, personal.id, checking.id, { name: "Checking cash", assetClass: "CASH", currentValue: "18420.55" });
  await ensureAsset(user.id, personal.id, brokerage.id, { name: "VTI", symbol: "VTI", assetClass: "EQUITY", currentValue: "84200.00", costBasis: "70000.00", quantity: "320" });
  await ensureAsset(user.id, personal.id, brokerage.id, { name: "AAPL", symbol: "AAPL", assetClass: "EQUITY", currentValue: "23400.00", costBasis: "12000.00", quantity: "120" });
  await ensureAsset(user.id, personal.id, null, { name: "Primary residence", assetClass: "REAL_ESTATE", currentValue: "620000.00", costBasis: "540000.00" });
  await ensureAsset(user.id, personal.id, null, { name: "BTC", symbol: "BTC", assetClass: "CRYPTO", currentValue: "32100.00", costBasis: "18000.00" });
  await ensureAsset(user.id, company.id, corpCash.id, { name: "Operating cash", assetClass: "CASH", currentValue: "112540.00" });

  await ensureLiability(user.id, personal.id, null, { name: "Mortgage", kind: "MORTGAGE", currentValue: "412000.00", interestRate: "5.875" });
  await ensureLiability(user.id, personal.id, card.id, { name: "Amex Gold", kind: "CREDIT_CARD", currentValue: "1840.21" });

  // 12 months of snapshots — synthetic but consistent.
  const baseNetWorth = 470000;
  for (let i = 12; i >= 0; i--) {
    const date = startOfMonth(subMonths(new Date(), i));
    const growth = baseNetWorth + (12 - i) * 4200 + Math.sin(i / 2) * 5000;
    const assets = growth + 420000;
    const liabilities = 412000;
    await prisma.snapshot.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: {
        userId: user.id, date, currency: "USD",
        totalAssets: new Decimal(assets).toFixed(2),
        totalLiabilities: new Decimal(liabilities).toFixed(2),
        netWorth: new Decimal(assets - liabilities).toFixed(2),
        byAssetClass: { CASH: "18420.55", EQUITY: "107600.00", REAL_ESTATE: "620000.00", CRYPTO: "32100.00" },
        byEntity: { [personal.id]: { name: "Personal", value: new Decimal(assets - liabilities - 112540).toFixed(2) }, [company.id]: { name: "Company", value: "112540.00" } },
      },
      update: {},
    });
  }

  console.log("Seeded demo data for", email);
}

async function ensureAccount(userId: string, entityId: string, d: { name: string; institution: string; kind: any }) {
  const existing = await prisma.finAccount.findFirst({ where: { userId, name: d.name } });
  if (existing) return existing;
  return prisma.finAccount.create({ data: { userId, entityId, name: d.name, institution: d.institution, kind: d.kind, currency: "USD" } });
}

async function ensureAsset(userId: string, entityId: string, finAccountId: string | null, d: { name: string; symbol?: string; assetClass: any; currentValue: string; costBasis?: string; quantity?: string }) {
  const existing = await prisma.asset.findFirst({ where: { userId, name: d.name } });
  if (existing) return existing;
  return prisma.asset.create({
    data: {
      userId, entityId, finAccountId,
      name: d.name, symbol: d.symbol, assetClass: d.assetClass,
      currency: "USD",
      currentValue: d.currentValue,
      costBasis: d.costBasis,
      quantity: d.quantity,
    },
  });
}

async function ensureLiability(userId: string, entityId: string, finAccountId: string | null, d: { name: string; kind: any; currentValue: string; interestRate?: string }) {
  const existing = await prisma.liability.findFirst({ where: { userId, name: d.name } });
  if (existing) return existing;
  return prisma.liability.create({
    data: {
      userId, entityId, finAccountId,
      name: d.name, kind: d.kind,
      currency: "USD",
      currentValue: d.currentValue,
      interestRate: d.interestRate,
    },
  });
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
