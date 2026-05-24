-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('PERSONAL', 'COMPANY', 'TRUST', 'JOINT', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinAccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'BROKERAGE', 'RETIREMENT', 'CRYPTO_WALLET', 'CASH', 'LOAN', 'MORTGAGE', 'REAL_ESTATE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('CASH', 'EQUITY', 'BOND', 'CRYPTO', 'REAL_ESTATE', 'COMMODITY', 'PRIVATE_EQUITY', 'COLLECTIBLE', 'RETIREMENT', 'RECEIVABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "LiabilityKind" AS ENUM ('CREDIT_CARD', 'LOAN', 'MORTGAGE', 'STUDENT_LOAN', 'TAX', 'PAYABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ValuationSource" AS ENUM ('MANUAL', 'IMPORT', 'MARKET_FEED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('PENDING', 'CLEARED', 'REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NoteTarget" AS ENUM ('ASSET', 'LIABILITY', 'ENTITY', 'ACCOUNT', 'GLOBAL');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'PARSING', 'REVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('OK', 'FAILED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('NET_WORTH', 'ASSET_CLASS', 'SAVINGS_RATE', 'DEBT_PAYDOWN', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "displayCurrency" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EntityKind" NOT NULL DEFAULT 'PERSONAL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "kind" "FinAccountKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "externalId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "finAccountId" TEXT,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'CASH',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" DECIMAL(28,10),
    "costBasis" DECIMAL(20,2),
    "currentValue" DECIMAL(20,2) NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "finAccountId" TEXT,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "LiabilityKind" NOT NULL DEFAULT 'LOAN',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "principal" DECIMAL(20,2),
    "interestRate" DECIMAL(8,4),
    "currentValue" DECIMAL(20,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "liabilityId" TEXT,
    "date" DATE NOT NULL,
    "value" DECIMAL(20,2) NOT NULL,
    "quantity" DECIMAL(28,10),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" "ValuationSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAssets" DECIMAL(20,2) NOT NULL,
    "totalLiabilities" DECIMAL(20,2) NOT NULL,
    "netWorth" DECIMAL(20,2) NOT NULL,
    "byAssetClass" JSONB NOT NULL,
    "byEntity" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finAccountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "ocrExtractionId" TEXT,
    "date" DATE NOT NULL,
    "postedDate" DATE,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "merchantNormalized" TEXT,
    "status" "TxnStatus" NOT NULL DEFAULT 'CLEARED',
    "confidence" DOUBLE PRECISION,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagOnAsset" (
    "tagId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "TagOnAsset_pkey" PRIMARY KEY ("tagId","assetId")
);

-- CreateTable
CREATE TABLE "TagOnTransaction" (
    "tagId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "TagOnTransaction_pkey" PRIMARY KEY ("tagId","transactionId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetType" "NoteTarget",
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finAccountId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "ivBase64" TEXT NOT NULL,
    "wrappedDekB64" TEXT NOT NULL,
    "authTagB64" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" TIMESTAMP(3),

    CONSTRAINT "StatementUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrExtraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rawText" TEXT,
    "structured" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'USD',
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupMetadata" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'OK',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GoalKind" NOT NULL DEFAULT 'NET_WORTH',
    "targetValue" DECIMAL(20,2) NOT NULL,
    "targetDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE INDEX "Entity_userId_idx" ON "Entity"("userId");

-- CreateIndex
CREATE INDEX "FinAccount_userId_archived_idx" ON "FinAccount"("userId", "archived");

-- CreateIndex
CREATE INDEX "FinAccount_entityId_idx" ON "FinAccount"("entityId");

-- CreateIndex
CREATE INDEX "Asset_userId_archived_idx" ON "Asset"("userId", "archived");

-- CreateIndex
CREATE INDEX "Asset_entityId_idx" ON "Asset"("entityId");

-- CreateIndex
CREATE INDEX "Asset_assetClass_idx" ON "Asset"("assetClass");

-- CreateIndex
CREATE INDEX "Liability_userId_archived_idx" ON "Liability"("userId", "archived");

-- CreateIndex
CREATE INDEX "Liability_entityId_idx" ON "Liability"("entityId");

-- CreateIndex
CREATE INDEX "Valuation_userId_date_idx" ON "Valuation"("userId", "date");

-- CreateIndex
CREATE INDEX "Valuation_assetId_date_idx" ON "Valuation"("assetId", "date");

-- CreateIndex
CREATE INDEX "Valuation_liabilityId_date_idx" ON "Valuation"("liabilityId", "date");

-- CreateIndex
CREATE INDEX "Snapshot_userId_date_idx" ON "Snapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_userId_date_key" ON "Snapshot"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_finAccountId_date_idx" ON "Transaction"("finAccountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_merchantNormalized_idx" ON "Transaction"("merchantNormalized");

-- CreateIndex
CREATE INDEX "Category_userId_kind_idx" ON "Category"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_kind_key" ON "Category"("userId", "name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "Note_userId_date_idx" ON "Note"("userId", "date");

-- CreateIndex
CREATE INDEX "StatementUpload_userId_status_idx" ON "StatementUpload"("userId", "status");

-- CreateIndex
CREATE INDEX "FxRate_quote_date_idx" ON "FxRate"("quote", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_date_base_quote_key" ON "FxRate"("date", "base", "quote");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupMetadata_date_key" ON "BackupMetadata"("date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinAccount" ADD CONSTRAINT "FinAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinAccount" ADD CONSTRAINT "FinAccount_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ocrExtractionId_fkey" FOREIGN KEY ("ocrExtractionId") REFERENCES "OcrExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnAsset" ADD CONSTRAINT "TagOnAsset_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnAsset" ADD CONSTRAINT "TagOnAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnTransaction" ADD CONSTRAINT "TagOnTransaction_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnTransaction" ADD CONSTRAINT "TagOnTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementUpload" ADD CONSTRAINT "StatementUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementUpload" ADD CONSTRAINT "StatementUpload_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrExtraction" ADD CONSTRAINT "OcrExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrExtraction" ADD CONSTRAINT "OcrExtraction_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "StatementUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

