-- AlterTable
ALTER TABLE "ElearningModule" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSizeBytes" INTEGER,
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'video';

-- AlterTable
ALTER TABLE "ElearningProgress" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedByName" TEXT,
ADD COLUMN     "assignedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ElearningProgress_dossierId_moduleId_key" ON "ElearningProgress"("dossierId", "moduleId");

