-- AlterTable
ALTER TABLE "QualiopiIndicator" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'all';
