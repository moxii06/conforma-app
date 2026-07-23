-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "courseOfInterestId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT';

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_courseOfInterestId_fkey" FOREIGN KEY ("courseOfInterestId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
