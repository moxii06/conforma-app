-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('FIXED_DATE', 'ROLLING');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "accessDurationDays" INTEGER,
ADD COLUMN     "firstAccessedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "mode" "SessionMode" NOT NULL DEFAULT 'FIXED_DATE';

