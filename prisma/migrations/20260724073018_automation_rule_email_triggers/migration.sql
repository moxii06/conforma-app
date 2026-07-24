-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "emailBody" TEXT,
ADD COLUMN     "emailSubject" TEXT;

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "contractAutoReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "rollingDurationAutoReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "satisfactionAutoReminderSentAt" TIMESTAMP(3);
