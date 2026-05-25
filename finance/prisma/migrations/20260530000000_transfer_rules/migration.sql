-- User-defined "this counterparty is one of my own accounts" rules.
-- Auto-applied to new transactions + on rule create (backfill).

CREATE TYPE "TransferMatchType" AS ENUM (
  'MERCHANT_EXACT', 'IBAN_EXACT', 'DESCRIPTION_CONTAINS'
);

CREATE TABLE "TransferRule" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "matchType" "TransferMatchType" NOT NULL,
    "pattern"   TEXT NOT NULL,
    "label"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransferRule_userId_matchType_pattern_key"
  ON "TransferRule"("userId", "matchType", "pattern");
CREATE INDEX "TransferRule_userId_idx" ON "TransferRule"("userId");

ALTER TABLE "TransferRule"
  ADD CONSTRAINT "TransferRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
