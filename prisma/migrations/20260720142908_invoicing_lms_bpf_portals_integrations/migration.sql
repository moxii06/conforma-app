-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "bodyText" TEXT,
ALTER COLUMN "fileUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "learnerCategory" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "fundingOrigin" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "dossierId" TEXT;

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationCredential_organizationId_idx" ON "IntegrationCredential"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_organizationId_provider_key" ON "IntegrationCredential"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
