-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionSurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,

    CONSTRAINT "SatisfactionSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionSurveyResponse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "answers" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SatisfactionSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_organizationId_idx" ON "SatisfactionSurvey"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_courseId_kind_key" ON "SatisfactionSurvey"("courseId", "kind");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyQuestion_surveyId_idx" ON "SatisfactionSurveyQuestion"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurveyResponse_token_key" ON "SatisfactionSurveyResponse"("token");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyResponse_organizationId_idx" ON "SatisfactionSurveyResponse"("organizationId");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyResponse_dossierId_idx" ON "SatisfactionSurveyResponse"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurveyResponse_surveyId_dossierId_key" ON "SatisfactionSurveyResponse"("surveyId", "dossierId");

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurveyQuestion" ADD CONSTRAINT "SatisfactionSurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurveyResponse" ADD CONSTRAINT "SatisfactionSurveyResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurveyResponse" ADD CONSTRAINT "SatisfactionSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurveyResponse" ADD CONSTRAINT "SatisfactionSurveyResponse_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
