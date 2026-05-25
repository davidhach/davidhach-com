-- Patch phase 1 — additive schema changes.
-- 1) Password + TOTP fields on User (magic-link login is unchanged).
-- 2) New AssetClass enum values + custom user-defined classes.
-- 3) Price-adapter fields on Asset.
-- 4) CategoryRule for "teach the tool" auto-categorisation.
-- All changes are additive — no existing data is touched or moved.

-- ── User: password + TOTP + lockout fields ──────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "passwordHash"      TEXT,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "totpSecretEnc"     TEXT,
  ADD COLUMN "totpEnabled"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recoveryCodesHash" TEXT,
  ADD COLUMN "failedLoginCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"       TIMESTAMP(3);

-- ── AssetClass: add new enum values (legacy values kept) ───────────────────
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'STOCKS';
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'COMPANY_SHARES';
ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'LOAN_RECEIVABLE';

-- ── ValuationSource: add PRICE_ADAPTER for automated daily refresh ─────────
ALTER TYPE "ValuationSource" ADD VALUE IF NOT EXISTS 'PRICE_ADAPTER';

-- ── AssetClassCustom: user-defined classes ─────────────────────────────────
CREATE TABLE "AssetClassCustom" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "color"     TEXT,
    "icon"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetClassCustom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetClassCustom_userId_name_key" ON "AssetClassCustom"("userId", "name");
CREATE INDEX "AssetClassCustom_userId_idx" ON "AssetClassCustom"("userId");
ALTER TABLE "AssetClassCustom"
  ADD CONSTRAINT "AssetClassCustom_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Asset: price-adapter fields + custom-class FK ──────────────────────────
ALTER TABLE "Asset"
  ADD COLUMN "customClassId" TEXT,
  ADD COLUMN "priceSource"   TEXT,
  ADD COLUMN "externalRef"   TEXT,
  ADD COLUMN "lastPricedAt"  TIMESTAMP(3);

CREATE INDEX "Asset_priceSource_lastPricedAt_idx"
  ON "Asset"("priceSource", "lastPricedAt");

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_customClassId_fkey"
  FOREIGN KEY ("customClassId") REFERENCES "AssetClassCustom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CategoryRule: "teach the tool" ─────────────────────────────────────────
CREATE TYPE "CategoryMatch" AS ENUM ('MERCHANT_EXACT', 'DESCRIPTION_CONTAINS');

CREATE TABLE "CategoryRule" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "matchType"   "CategoryMatch" NOT NULL DEFAULT 'MERCHANT_EXACT',
    "pattern"     TEXT NOT NULL,
    "categoryId"  TEXT NOT NULL,
    "priority"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryRule_userId_matchType_pattern_key"
  ON "CategoryRule"("userId", "matchType", "pattern");
CREATE INDEX "CategoryRule_userId_priority_idx"
  ON "CategoryRule"("userId", "priority");

ALTER TABLE "CategoryRule"
  ADD CONSTRAINT "CategoryRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryRule"
  ADD CONSTRAINT "CategoryRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
