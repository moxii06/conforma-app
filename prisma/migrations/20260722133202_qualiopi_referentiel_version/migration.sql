-- CreateTable
CREATE TABLE "QualiopiReferentielVersion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'projet',
    "publishedAt" TIMESTAMP(3),
    "applicableFrom" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualiopiReferentielVersion_pkey" PRIMARY KEY ("id")
);

-- Seed the version that every existing indicator/org implicitly belongs to
-- today, so the backfill below has something to point at.
INSERT INTO "QualiopiReferentielVersion" (id, label, status, "publishedAt", "applicableFrom", notes, "createdAt")
VALUES (
  'rnq2022v1',
  'RNQ 2022 (en vigueur)',
  'applicable',
  '2022-01-01T00:00:00Z',
  '2022-01-01T00:00:00Z',
  'Référentiel National Qualité en vigueur depuis le lancement de Qualiopi.',
  now()
);

-- AlterTable (nullable first — existing rows get backfilled below, not a
-- default, since a default would silently apply to future inserts too)
ALTER TABLE "QualiopiIndicator" ADD COLUMN "versionId" TEXT;
UPDATE "QualiopiIndicator" SET "versionId" = 'rnq2022v1' WHERE "versionId" IS NULL;
ALTER TABLE "QualiopiIndicator" ALTER COLUMN "versionId" SET NOT NULL;

-- DropIndex
DROP INDEX "QualiopiIndicator_number_key";

-- CreateIndex
CREATE INDEX "QualiopiIndicator_versionId_idx" ON "QualiopiIndicator"("versionId");
CREATE UNIQUE INDEX "QualiopiIndicator_versionId_number_key" ON "QualiopiIndicator"("versionId", "number");

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "activeReferentielVersionId" TEXT;
UPDATE "Organization" SET "activeReferentielVersionId" = 'rnq2022v1' WHERE "activeReferentielVersionId" IS NULL;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_activeReferentielVersionId_fkey" FOREIGN KEY ("activeReferentielVersionId") REFERENCES "QualiopiReferentielVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualiopiIndicator" ADD CONSTRAINT "QualiopiIndicator_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QualiopiReferentielVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
