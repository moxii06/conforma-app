-- Extensions du back-office propriétaire (/plateforme) : date d'acceptation
-- des CGV (saisie à la main par le propriétaire de la plateforme) et
-- historique des emails ponctuels envoyés à un organisme.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "cgvAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformEmailMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformEmailMessage_organizationId_idx" ON "PlatformEmailMessage"("organizationId");

-- AddForeignKey
ALTER TABLE "PlatformEmailMessage" ADD CONSTRAINT "PlatformEmailMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
