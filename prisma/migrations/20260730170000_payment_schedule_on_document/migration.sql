-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "paymentSchedule" JSONB;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paymentCapAckAt" TIMESTAMP(3),
ADD COLUMN     "paymentCapAckByName" TEXT;

