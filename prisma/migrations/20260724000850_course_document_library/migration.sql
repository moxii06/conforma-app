-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "durationHours" INTEGER,
ADD COLUMN     "priceCents" INTEGER;

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "courseId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentTemplate_courseId_idx" ON "DocumentTemplate"("courseId");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

