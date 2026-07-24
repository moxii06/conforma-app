-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DashboardTaskDismissal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dismissedByUserId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardTaskDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardTaskDismissal_organizationId_idx" ON "DashboardTaskDismissal"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardTaskDismissal_organizationId_kind_entityId_key" ON "DashboardTaskDismissal"("organizationId", "kind", "entityId");

-- AddForeignKey
ALTER TABLE "DashboardTaskDismissal" ADD CONSTRAINT "DashboardTaskDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
