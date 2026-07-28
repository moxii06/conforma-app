-- CreateTable
CREATE TABLE "IntervenantEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "subcontractorId" TEXT,
    "subjectName" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "strengths" TEXT,
    "developmentPlan" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntervenantEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntervenantEvaluation_organizationId_idx" ON "IntervenantEvaluation"("organizationId");

-- AddForeignKey
ALTER TABLE "IntervenantEvaluation" ADD CONSTRAINT "IntervenantEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervenantEvaluation" ADD CONSTRAINT "IntervenantEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntervenantEvaluation" ADD CONSTRAINT "IntervenantEvaluation_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

