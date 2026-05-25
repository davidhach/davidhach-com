-- Assets phase 3: ISIN-first, quantity-based STOCKS + CRYPTO.
-- All additive — existing manual/value Assets keep working unchanged.

-- ── AssetTransactionKind enum ──────────────────────────────────────────────
CREATE TYPE "AssetTransactionKind" AS ENUM (
  'BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'TRANSFER_IN', 'TRANSFER_OUT'
);

-- ── AssetTransaction: BUY/SELL ledger ──────────────────────────────────────
CREATE TABLE "AssetTransaction" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "assetId"      TEXT NOT NULL,
    "kind"         "AssetTransactionKind" NOT NULL,
    "date"         DATE NOT NULL,
    "quantity"     DECIMAL(28,10) NOT NULL,
    "pricePerUnit" DECIMAL(20,8)  NOT NULL,
    "currency"     TEXT NOT NULL,
    "fee"          DECIMAL(20,2),
    "finAccountId" TEXT,
    "sourceTxId"   TEXT,
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetTransaction_userId_date_idx"    ON "AssetTransaction"("userId", "date");
CREATE INDEX "AssetTransaction_assetId_date_idx"   ON "AssetTransaction"("assetId", "date");
CREATE INDEX "AssetTransaction_sourceTxId_idx"     ON "AssetTransaction"("sourceTxId");

ALTER TABLE "AssetTransaction"
  ADD CONSTRAINT "AssetTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTransaction"
  ADD CONSTRAINT "AssetTransaction_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTransaction"
  ADD CONSTRAINT "AssetTransaction_finAccountId_fkey"
  FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PriceHistory: per-(source, ref, date) ──────────────────────────────────
CREATE TABLE "PriceHistory" (
    "id"          TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "date"        DATE NOT NULL,
    "price"       DECIMAL(20,8) NOT NULL,
    "currency"    TEXT NOT NULL,
    "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceHistory_source_externalRef_date_key"
  ON "PriceHistory"("source", "externalRef", "date");
CREATE INDEX "PriceHistory_source_externalRef_date_idx"
  ON "PriceHistory"("source", "externalRef", "date");

-- ── IsinMapping: OpenFIGI cache ────────────────────────────────────────────
CREATE TABLE "IsinMapping" (
    "isin"       TEXT NOT NULL,
    "ticker"     TEXT,
    "stooqRef"   TEXT,
    "name"       TEXT,
    "exchange"   TEXT,
    "marketCode" TEXT,
    "fetchedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IsinMapping_pkey" PRIMARY KEY ("isin")
);
