-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "accessDelay" TEXT,
ADD COLUMN     "accessModalities" TEXT,
ADD COLUMN     "evaluationModalities" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "prerequisites" TEXT,
ADD COLUMN     "teachingMethods" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "publicContactEmail" TEXT,
ADD COLUMN     "publicContactPhone" TEXT;

