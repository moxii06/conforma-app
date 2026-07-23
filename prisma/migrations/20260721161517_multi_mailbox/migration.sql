-- DropIndex
DROP INDEX "MailboxConnection_organizationId_provider_key";

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "mailboxConnectionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_organizationId_provider_accountEmail_key" ON "MailboxConnection"("organizationId", "provider", "accountEmail");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

