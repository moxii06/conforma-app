-- AlterTable
ALTER TABLE "Dossier" ADD COLUMN     "needsAssessmentAutoReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "afterDays" INTEGER NOT NULL,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CourseSubcontractors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_idx" ON "AutomationRule"("organizationId");

-- CreateIndex
CREATE INDEX "AutomationRule_courseId_idx" ON "AutomationRule"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "_CourseSubcontractors_AB_unique" ON "_CourseSubcontractors"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseSubcontractors_B_index" ON "_CourseSubcontractors"("B");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseSubcontractors" ADD CONSTRAINT "_CourseSubcontractors_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseSubcontractors" ADD CONSTRAINT "_CourseSubcontractors_B_fkey" FOREIGN KEY ("B") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
