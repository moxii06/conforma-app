-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalThreadId" TEXT;

-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_externalId_key" ON "EmailMessage"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_organizationId_provider_key" ON "MailboxConnection"("organizationId", "provider");

