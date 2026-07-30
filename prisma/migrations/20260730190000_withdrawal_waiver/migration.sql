-- CreateTable
CREATE TABLE "WithdrawalWaiver" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "textAccepted" TEXT NOT NULL,
    "checkboxDefaultUnchecked" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WithdrawalWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalWaiver_dossierId_key" ON "WithdrawalWaiver"("dossierId");

-- CreateIndex
CREATE INDEX "WithdrawalWaiver_organizationId_idx" ON "WithdrawalWaiver"("organizationId");

-- AddForeignKey
ALTER TABLE "WithdrawalWaiver" ADD CONSTRAINT "WithdrawalWaiver_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

