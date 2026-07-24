-- CreateTable
CREATE TABLE "OrgChartSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "OrgChartSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgChartSnapshot_organizationId_createdAt_idx" ON "OrgChartSnapshot"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgChartSnapshot" ADD CONSTRAINT "OrgChartSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
