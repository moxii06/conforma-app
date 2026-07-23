-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "RightsRequest" ADD COLUMN     "details" TEXT,
ADD COLUMN     "submittedByUserId" TEXT;

