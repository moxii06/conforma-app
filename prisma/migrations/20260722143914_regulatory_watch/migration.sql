-- CreateTable
CREATE TABLE "RegulatoryWatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "watchType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "watchDate" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "decision" TEXT,
    "actionTaken" TEXT,
    "exploitedAt" TIMESTAMP(3),
    "evidenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CourseToRegulatoryWatch" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "RegulatoryWatch_organizationId_idx" ON "RegulatoryWatch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "_CourseToRegulatoryWatch_AB_unique" ON "_CourseToRegulatoryWatch"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseToRegulatoryWatch_B_index" ON "_CourseToRegulatoryWatch"("B");

-- AddForeignKey
ALTER TABLE "RegulatoryWatch" ADD CONSTRAINT "RegulatoryWatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToRegulatoryWatch" ADD CONSTRAINT "_CourseToRegulatoryWatch_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToRegulatoryWatch" ADD CONSTRAINT "_CourseToRegulatoryWatch_B_fkey" FOREIGN KEY ("B") REFERENCES "RegulatoryWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

