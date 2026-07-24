-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "assigneeComment" TEXT,
ADD COLUMN     "assigneeDeadline" TIMESTAMP(3),
ADD COLUMN     "submittedByEmail" TEXT;

-- AlterTable
ALTER TABLE "SecureReport" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "assigneeComment" TEXT,
ADD COLUMN     "assigneeDeadline" TIMESTAMP(3);

