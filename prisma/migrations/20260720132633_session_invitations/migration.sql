-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "meetingLink" TEXT;

-- CreateTable
CREATE TABLE "SessionInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionInvitationDocument" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "SessionInvitationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionInvitation_organizationId_idx" ON "SessionInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "SessionInvitation_sessionId_idx" ON "SessionInvitation"("sessionId");

-- CreateIndex
CREATE INDEX "SessionInvitation_dossierId_idx" ON "SessionInvitation"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionInvitationDocument_invitationId_documentId_key" ON "SessionInvitationDocument"("invitationId", "documentId");

-- AddForeignKey
ALTER TABLE "SessionInvitation" ADD CONSTRAINT "SessionInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInvitation" ADD CONSTRAINT "SessionInvitation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInvitation" ADD CONSTRAINT "SessionInvitation_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInvitationDocument" ADD CONSTRAINT "SessionInvitationDocument_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "SessionInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInvitationDocument" ADD CONSTRAINT "SessionInvitationDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
