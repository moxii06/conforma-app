-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "qualiopiCategories" TEXT,
ADD COLUMN     "qualiopiCertificateNumber" TEXT,
ADD COLUMN     "qualiopiCertificateUntil" TIMESTAMP(3),
ADD COLUMN     "qualiopiCertifiedSince" TIMESTAMP(3),
ADD COLUMN     "qualiopiCertifier" TEXT;

-- CreateTable
CREATE TABLE "QualiopiAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "auditDate" TIMESTAMP(3) NOT NULL,
    "certifierName" TEXT NOT NULL,
    "auditorName" TEXT,
    "durationDays" DOUBLE PRECISION,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "conclusions" TEXT,
    "nextAuditType" TEXT,
    "nextAuditDate" TIMESTAMP(3),
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualiopiAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualiopiAuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "indicatorNumber" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "implementedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ouverte',
    "liftedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closureComment" TEXT,

    CONSTRAINT "QualiopiAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualiopiAudit_organizationId_idx" ON "QualiopiAudit"("organizationId");

-- CreateIndex
CREATE INDEX "QualiopiAuditFinding_auditId_idx" ON "QualiopiAuditFinding"("auditId");

-- AddForeignKey
ALTER TABLE "QualiopiAudit" ADD CONSTRAINT "QualiopiAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualiopiAuditFinding" ADD CONSTRAINT "QualiopiAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "QualiopiAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

