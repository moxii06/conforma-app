-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other';

-- CreateTable
CREATE TABLE "_CourseResponsibles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CourseResponsibles_AB_unique" ON "_CourseResponsibles"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseResponsibles_B_index" ON "_CourseResponsibles"("B");

-- AddForeignKey
ALTER TABLE "_CourseResponsibles" ADD CONSTRAINT "_CourseResponsibles_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseResponsibles" ADD CONSTRAINT "_CourseResponsibles_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

