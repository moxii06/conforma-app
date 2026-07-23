-- CreateTable
CREATE TABLE "ResultIndicator" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT,
    "label" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "computedFrom" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalPopulation" INTEGER NOT NULL,
    "respondents" INTEGER NOT NULL,
    "exclusions" INTEGER NOT NULL DEFAULT 0,
    "computedValue" DOUBLE PRECISION,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultIndicator_organizationId_idx" ON "ResultIndicator"("organizationId");

-- CreateIndex
CREATE INDEX "ResultIndicator_courseId_idx" ON "ResultIndicator"("courseId");

-- AddForeignKey
ALTER TABLE "ResultIndicator" ADD CONSTRAINT "ResultIndicator_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultIndicator" ADD CONSTRAINT "ResultIndicator_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

