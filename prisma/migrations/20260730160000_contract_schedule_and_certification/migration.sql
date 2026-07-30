-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "certificationCode" TEXT,
ADD COLUMN     "certificationName" TEXT,
ADD COLUMN     "certificationRegistry" TEXT,
ADD COLUMN     "certifierName" TEXT,
ADD COLUMN     "retakeConditions" TEXT;

-- AlterTable
ALTER TABLE "ElearningModule" ADD COLUMN     "availableDuringWithdrawal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "installmentTotal" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "cancellationFeePercent" INTEGER,
ADD COLUMN     "mediatorContact" TEXT,
ADD COLUMN     "mediatorName" TEXT,
ADD COLUMN     "regionPrefecture" TEXT,
ADD COLUMN     "withdrawalAccessPolicy" TEXT NOT NULL DEFAULT 'closed';

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

