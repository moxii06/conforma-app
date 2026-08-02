-- Prises de contact notées à la main par le propriétaire de la plateforme
-- (appel, rendez-vous, échange hors email).

-- CreateTable
CREATE TABLE "PlatformContactNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformContactNote_organizationId_idx" ON "PlatformContactNote"("organizationId");

-- AddForeignKey
ALTER TABLE "PlatformContactNote" ADD CONSTRAINT "PlatformContactNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
