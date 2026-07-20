-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "forkedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeedsAssessmentRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "token" TEXT NOT NULL,
    "templateBody" TEXT NOT NULL,
    "responseText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentByUserId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NeedsAssessmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_organizationId_idx" ON "DocumentTemplate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "NeedsAssessmentRequest_token_key" ON "NeedsAssessmentRequest"("token");

-- CreateIndex
CREATE INDEX "NeedsAssessmentRequest_organizationId_idx" ON "NeedsAssessmentRequest"("organizationId");

-- CreateIndex
CREATE INDEX "NeedsAssessmentRequest_contactId_idx" ON "NeedsAssessmentRequest"("contactId");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedsAssessmentRequest" ADD CONSTRAINT "NeedsAssessmentRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedsAssessmentRequest" ADD CONSTRAINT "NeedsAssessmentRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedsAssessmentRequest" ADD CONSTRAINT "NeedsAssessmentRequest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
