-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "funderId" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

