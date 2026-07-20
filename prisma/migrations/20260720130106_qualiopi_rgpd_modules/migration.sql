/*
  Warnings:

  - Added the required column `organizationId` to the `DPIARecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DPIARecord" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nextAuditDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProcessingActivity" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RightsRequest" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SubProcessor" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "QualiopiIndicator" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "criterionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "QualiopiIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditChecklistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "indicatorNumber" INTEGER NOT NULL,
    "gathered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualiopiIndicator_number_key" ON "QualiopiIndicator"("number");

-- CreateIndex
CREATE INDEX "AuditChecklistItem_organizationId_idx" ON "AuditChecklistItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditChecklistItem_organizationId_indicatorNumber_key" ON "AuditChecklistItem"("organizationId", "indicatorNumber");

-- CreateIndex
CREATE INDEX "DPIARecord_organizationId_idx" ON "DPIARecord"("organizationId");

-- AddForeignKey
ALTER TABLE "DPIARecord" ADD CONSTRAINT "DPIARecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChecklistItem" ADD CONSTRAINT "AuditChecklistItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
