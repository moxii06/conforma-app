-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "rgpdClassifiedAt" TIMESTAMP(3),
ADD COLUMN     "rgpdReasoning" TEXT,
ADD COLUMN     "rgpdSuggestedType" TEXT;
