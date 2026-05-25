-- Phase 2: read-only bank / crypto / CSV connectors.
-- All additive — no existing data touched.

-- ── BankConnectionStatus enum ──────────────────────────────────────────────
CREATE TYPE "BankConnectionStatus" AS ENUM (
  'PENDING', 'ACTIVE', 'CONSENT_EXPIRED', 'ERROR', 'REVOKED'
);

-- ── BankConnection: one row per (user, provider, institution / address) ────
CREATE TABLE "BankConnection" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "provider"         TEXT NOT NULL,
    "institutionId"    TEXT,
    "institutionName"  TEXT NOT NULL,
    "status"           "BankConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "consentExpiresAt" TIMESTAMP(3),
    "requisitionId"    TEXT,
    "accessTokenEnc"   TEXT,
    "refreshTokenEnc"  TEXT,
    "address"          TEXT,
    "lastSyncedAt"     TIMESTAMP(3),
    "lastError"        TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankConnection_userId_status_idx"   ON "BankConnection"("userId", "status");
CREATE INDEX "BankConnection_provider_status_idx" ON "BankConnection"("provider", "status");
ALTER TABLE "BankConnection"
  ADD CONSTRAINT "BankConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── BankAccountLink: one per (connection, external account) ────────────────
CREATE TABLE "BankAccountLink" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "connectionId"  TEXT NOT NULL,
    "finAccountId"  TEXT NOT NULL,
    "externalId"    TEXT NOT NULL,
    "iban"          TEXT,
    "currency"      TEXT NOT NULL,
    "lastBalance"   DECIMAL(20,2),
    "lastBalanceAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAccountLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankAccountLink_connectionId_externalId_key"
  ON "BankAccountLink"("connectionId", "externalId");
CREATE INDEX "BankAccountLink_userId_idx"       ON "BankAccountLink"("userId");
CREATE INDEX "BankAccountLink_finAccountId_idx" ON "BankAccountLink"("finAccountId");

ALTER TABLE "BankAccountLink"
  ADD CONSTRAINT "BankAccountLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccountLink"
  ADD CONSTRAINT "BankAccountLink_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccountLink"
  ADD CONSTRAINT "BankAccountLink_finAccountId_fkey"
  FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
