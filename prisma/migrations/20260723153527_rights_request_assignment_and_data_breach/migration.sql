-- AlterTable
ALTER TABLE "RightsRequest" ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "assignedToUserId" TEXT;

-- CreateTable
CREATE TABLE "DataBreach" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "affectedDataTypes" TEXT NOT NULL,
    "affectedPeopleCount" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "status" TEXT NOT NULL DEFAULT 'investigating',
    "notifiedAuthorityAt" TIMESTAMP(3),
    "notifiedSubjectsAt" TIMESTAMP(3),
    "remediation" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataBreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataBreach_organizationId_idx" ON "DataBreach"("organizationId");

-- AddForeignKey
ALTER TABLE "DataBreach" ADD CONSTRAINT "DataBreach_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
