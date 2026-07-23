-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "referentHandicapUserId" TEXT;

-- CreateTable
CREATE TABLE "AccommodationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedAccommodations" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "grantedAccommodations" TEXT,
    "handledByUserId" TEXT,
    "handledByName" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccommodationRequest_organizationId_idx" ON "AccommodationRequest"("organizationId");

-- CreateIndex
CREATE INDEX "AccommodationRequest_dossierId_idx" ON "AccommodationRequest"("dossierId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_referentHandicapUserId_fkey" FOREIGN KEY ("referentHandicapUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationRequest" ADD CONSTRAINT "AccommodationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationRequest" ADD CONSTRAINT "AccommodationRequest_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

