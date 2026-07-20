-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN_OF', 'ADMIN_MANAGER', 'SALES', 'TRAINER', 'LEARNER', 'DPO_EXTERNAL');

-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('IN_PERSON', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('PROSPECT', 'QUOTE_SENT', 'CONTRACT_SIGNED', 'SESSION_SCHEDULED', 'INVOICED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerUserId" TEXT,
    "needsAssessmentDone" BOOLEAN NOT NULL DEFAULT false,
    "contractSigned" BOOLEAN NOT NULL DEFAULT false,
    "convocationSent" BOOLEAN NOT NULL DEFAULT false,
    "evaluationHotDone" BOOLEAN NOT NULL DEFAULT false,
    "evaluationColdDone" BOOLEAN NOT NULL DEFAULT false,
    "legalBasis" TEXT NOT NULL DEFAULT 'contract_performance',
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "trainerId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "format" "SessionFormat" NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER,
    "stage" "PipelineStage" NOT NULL DEFAULT 'PROSPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "einvoicingProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "templateOrigin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "retentionPeriod" TEXT NOT NULL,
    "riskFlag" TEXT NOT NULL DEFAULT 'ok',

    CONSTRAINT "ProcessingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubProcessor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "dpaStatus" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "SubProcessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPIARecord" (
    "id" TEXT NOT NULL,
    "processingActivityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'required',

    CONSTRAINT "DPIARecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RightsRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "personLabel" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "RightsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualiopiIndicatorEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT,
    "criterionNumber" INTEGER NOT NULL,
    "indicatorNumber" INTEGER NOT NULL,
    "evidenceNote" TEXT,

    CONSTRAINT "QualiopiIndicatorEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "NonConformity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ElearningModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningProgress" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),

    CONSTRAINT "ElearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT,
    "suggestedDossierId" TEXT,
    "matchBasis" TEXT,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Company_organizationId_idx" ON "Company"("organizationId");

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_email_key" ON "Contact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Dossier_organizationId_idx" ON "Dossier"("organizationId");

-- CreateIndex
CREATE INDEX "Dossier_contactId_idx" ON "Dossier"("contactId");

-- CreateIndex
CREATE INDEX "Course_organizationId_idx" ON "Course"("organizationId");

-- CreateIndex
CREATE INDEX "Session_organizationId_idx" ON "Session"("organizationId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_idx" ON "Opportunity"("organizationId");

-- CreateIndex
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");

-- CreateIndex
CREATE INDEX "Quote_organizationId_idx" ON "Quote"("organizationId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "ProcessingActivity_organizationId_idx" ON "ProcessingActivity"("organizationId");

-- CreateIndex
CREATE INDEX "SubProcessor_organizationId_idx" ON "SubProcessor"("organizationId");

-- CreateIndex
CREATE INDEX "RightsRequest_organizationId_idx" ON "RightsRequest"("organizationId");

-- CreateIndex
CREATE INDEX "QualiopiIndicatorEvidence_organizationId_idx" ON "QualiopiIndicatorEvidence"("organizationId");

-- CreateIndex
CREATE INDEX "NonConformity_organizationId_idx" ON "NonConformity"("organizationId");

-- CreateIndex
CREATE INDEX "MailboxConnection_organizationId_idx" ON "MailboxConnection"("organizationId");

-- CreateIndex
CREATE INDEX "EmailMessage_organizationId_idx" ON "EmailMessage"("organizationId");

-- CreateIndex
CREATE INDEX "EmailMessage_contactId_idx" ON "EmailMessage"("contactId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_learnerUserId_fkey" FOREIGN KEY ("learnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingActivity" ADD CONSTRAINT "ProcessingActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubProcessor" ADD CONSTRAINT "SubProcessor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPIARecord" ADD CONSTRAINT "DPIARecord_processingActivityId_fkey" FOREIGN KEY ("processingActivityId") REFERENCES "ProcessingActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RightsRequest" ADD CONSTRAINT "RightsRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualiopiIndicatorEvidence" ADD CONSTRAINT "QualiopiIndicatorEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualiopiIndicatorEvidence" ADD CONSTRAINT "QualiopiIndicatorEvidence_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformity" ADD CONSTRAINT "NonConformity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningModule" ADD CONSTRAINT "ElearningModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningProgress" ADD CONSTRAINT "ElearningProgress_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningProgress" ADD CONSTRAINT "ElearningProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ElearningModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
