-- CreateTable
CREATE TABLE "QualityRisk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT,
    "sourceNonConformityId" TEXT,
    "risk" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "probability" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerName" TEXT,
    "preventiveMeasure" TEXT,
    "correctiveAction" TEXT,
    "dueDate" TIMESTAMP(3),
    "evidenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identifie',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityRisk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityRisk_organizationId_idx" ON "QualityRisk"("organizationId");

-- CreateIndex
CREATE INDEX "QualityRisk_courseId_idx" ON "QualityRisk"("courseId");

-- AddForeignKey
ALTER TABLE "QualityRisk" ADD CONSTRAINT "QualityRisk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRisk" ADD CONSTRAINT "QualityRisk_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRisk" ADD CONSTRAINT "QualityRisk_sourceNonConformityId_fkey" FOREIGN KEY ("sourceNonConformityId") REFERENCES "NonConformity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

