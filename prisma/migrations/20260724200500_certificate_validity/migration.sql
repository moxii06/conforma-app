-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "certificateValidityMonths" INTEGER;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "expiryReminderSentAt" TIMESTAMP(3);
