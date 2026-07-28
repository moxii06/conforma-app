-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "allowVideoSkip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ElearningProgress" ADD COLUMN     "skippedAt" TIMESTAMP(3);
