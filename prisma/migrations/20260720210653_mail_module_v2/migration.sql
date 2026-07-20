-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "inReplyToId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activationToken" TEXT;

-- CreateTable
CREATE TABLE "ClientOutreach" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dossierId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentByUserId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ClientOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientOutreach_organizationId_idx" ON "ClientOutreach"("organizationId");

-- CreateIndex
CREATE INDEX "ClientOutreach_contactId_idx" ON "ClientOutreach"("contactId");

-- CreateIndex
CREATE INDEX "ClientOutreach_dossierId_idx" ON "ClientOutreach"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOutreach" ADD CONSTRAINT "ClientOutreach_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOutreach" ADD CONSTRAINT "ClientOutreach_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOutreach" ADD CONSTRAINT "ClientOutreach_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

