-- Auto-managed assets: an Asset row created and maintained by a bank/crypto
-- connection's sync. The FK + onDelete CASCADE means disconnecting the link
-- (or its parent BankConnection) removes the auto-asset as a clean tear-down.

ALTER TABLE "Asset" ADD COLUMN "managedByLinkId" TEXT;
CREATE INDEX "Asset_managedByLinkId_idx" ON "Asset"("managedByLinkId");
ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_managedByLinkId_fkey"
  FOREIGN KEY ("managedByLinkId") REFERENCES "BankAccountLink"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
