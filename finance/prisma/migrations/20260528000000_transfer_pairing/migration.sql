-- Internal transfer + card-settlement pairing. All additive.

CREATE TYPE "TransferKind" AS ENUM ('TRANSFER', 'CARD_PAYMENT');

ALTER TABLE "Transaction"
  ADD COLUMN "transferPairId"   TEXT,
  ADD COLUMN "transferKind"     "TransferKind",
  ADD COLUMN "excludeFromTotals" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_transferPairId_fkey"
  FOREIGN KEY ("transferPairId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
