-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "archivedAt" TIMESTAMP(3);

