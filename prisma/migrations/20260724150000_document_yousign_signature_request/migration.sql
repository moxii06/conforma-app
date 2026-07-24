-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "yousignSignatureRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_yousignSignatureRequestId_key" ON "Document"("yousignSignatureRequestId");
