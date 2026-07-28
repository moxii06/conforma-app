-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "agreedPriceCents" INTEGER;

-- CreateTable
CREATE TABLE "Funder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'opco',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Funder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingCommitment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "subrogation" BOOLEAN NOT NULL DEFAULT true,
    "agreementNumber" TEXT,
    "agreementDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'requested',
    "invoiceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Funder_organizationId_idx" ON "Funder"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Funder_organizationId_name_key" ON "Funder"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FundingCommitment_organizationId_idx" ON "FundingCommitment"("organizationId");

-- CreateIndex
CREATE INDEX "FundingCommitment_dossierId_idx" ON "FundingCommitment"("dossierId");

-- CreateIndex
CREATE INDEX "FundingCommitment_funderId_idx" ON "FundingCommitment"("funderId");

-- AddForeignKey
ALTER TABLE "Funder" ADD CONSTRAINT "Funder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingCommitment" ADD CONSTRAINT "FundingCommitment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

