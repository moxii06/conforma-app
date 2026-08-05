-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "sequentialUnlock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "withdrawalAccessPolicy" TEXT;