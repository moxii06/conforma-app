-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecureReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reporterName" TEXT,
    "reporterContact" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "escalationNotes" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecureReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecureReportAccessLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "viewedByUserId" TEXT NOT NULL,
    "viewedByName" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecureReportAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_organizationId_idx" ON "Complaint"("organizationId");

-- CreateIndex
CREATE INDEX "Complaint_dossierId_idx" ON "Complaint"("dossierId");

-- CreateIndex
CREATE INDEX "SecureReport_organizationId_idx" ON "SecureReport"("organizationId");

-- CreateIndex
CREATE INDEX "SecureReportAccessLog_reportId_idx" ON "SecureReportAccessLog"("reportId");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecureReport" ADD CONSTRAINT "SecureReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecureReportAccessLog" ADD CONSTRAINT "SecureReportAccessLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SecureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

