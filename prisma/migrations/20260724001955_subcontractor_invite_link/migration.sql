-- AlterTable
ALTER TABLE "Subcontractor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "isIndividual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "linkedUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subcontractor_linkedUserId_key" ON "Subcontractor"("linkedUserId");

-- AddForeignKey
ALTER TABLE "Subcontractor" ADD CONSTRAINT "Subcontractor_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

