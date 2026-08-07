-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "notifyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "proofFileName" TEXT,
ADD COLUMN     "proofFileUrl" TEXT,
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'soon';

-- AlterTable
ALTER TABLE "SecureReport" ADD COLUMN     "notifyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "proofFileName" TEXT,
ADD COLUMN     "proofFileUrl" TEXT,
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'soon';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "allowVideoSkip" BOOLEAN,
ADD COLUMN     "contractSigningMode" TEXT,
ADD COLUMN     "sequentialUnlock" BOOLEAN,
ADD COLUMN     "withdrawalAccessPolicy" TEXT;

-- AlterTable
ALTER TABLE "Subcontractor" ADD COLUMN     "renewalNoticeDays" INTEGER,
ADD COLUMN     "tacitRenewal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "additionalRoles" "Role"[] DEFAULT ARRAY[]::"Role"[];

-- CreateTable
CREATE TABLE "SubcontractorDocumentRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subcontractorType" TEXT NOT NULL,
    "documentCategory" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luAt" TIMESTAMP(3),

    CONSTRAINT "LearnerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "emetteur" TEXT NOT NULL,
    "auteurNom" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luParDestAt" TIMESTAMP(3),

    CONSTRAINT "PlatformMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAtelier" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'REMOTE',
    "location" TEXT,
    "meetingLink" TEXT,
    "capacity" INTEGER,
    "annuleeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAtelier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelierParticipant" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "presentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtelierParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubcontractorDocumentRequirement_organizationId_idx" ON "SubcontractorDocumentRequirement"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorDocumentRequirement_organizationId_subcontract_key" ON "SubcontractorDocumentRequirement"("organizationId", "subcontractorType", "documentCategory");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerThread_dossierId_key" ON "LearnerThread"("dossierId");

-- CreateIndex
CREATE INDEX "LearnerThread_organizationId_idx" ON "LearnerThread"("organizationId");

-- CreateIndex
CREATE INDEX "LearnerMessage_threadId_idx" ON "LearnerMessage"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformThread_organizationId_key" ON "PlatformThread"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformMessage_threadId_idx" ON "PlatformMessage"("threadId");

-- CreateIndex
CREATE INDEX "SessionAtelier_sessionId_idx" ON "SessionAtelier"("sessionId");

-- CreateIndex
CREATE INDEX "SessionAtelier_startsAt_idx" ON "SessionAtelier"("startsAt");

-- CreateIndex
CREATE INDEX "AtelierParticipant_dossierId_idx" ON "AtelierParticipant"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "AtelierParticipant_atelierId_dossierId_key" ON "AtelierParticipant"("atelierId", "dossierId");

-- AddForeignKey
ALTER TABLE "SubcontractorDocumentRequirement" ADD CONSTRAINT "SubcontractorDocumentRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerThread" ADD CONSTRAINT "LearnerThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerThread" ADD CONSTRAINT "LearnerThread_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerMessage" ADD CONSTRAINT "LearnerMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "LearnerThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerMessage" ADD CONSTRAINT "LearnerMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformThread" ADD CONSTRAINT "PlatformThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformMessage" ADD CONSTRAINT "PlatformMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "PlatformThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAtelier" ADD CONSTRAINT "SessionAtelier_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierParticipant" ADD CONSTRAINT "AtelierParticipant_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "SessionAtelier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelierParticipant" ADD CONSTRAINT "AtelierParticipant_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

