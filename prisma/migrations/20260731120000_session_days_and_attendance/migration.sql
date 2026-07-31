-- CreateEnum
CREATE TYPE "HalfDay" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateTable
CREATE TABLE "SessionDay" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "morningHours" DOUBLE PRECISION,
    "afternoonHours" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SessionDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "sessionDayId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "halfDay" "HalfDay" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureDataUrl" TEXT,
    "recordedByUserId" TEXT,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionDay_sessionId_idx" ON "SessionDay"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceEntry_sessionDayId_idx" ON "AttendanceEntry"("sessionDayId");

-- CreateIndex
CREATE INDEX "AttendanceEntry_dossierId_idx" ON "AttendanceEntry"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEntry_sessionDayId_dossierId_halfDay_key" ON "AttendanceEntry"("sessionDayId", "dossierId", "halfDay");

-- AddForeignKey
ALTER TABLE "SessionDay" ADD CONSTRAINT "SessionDay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_sessionDayId_fkey" FOREIGN KEY ("sessionDayId") REFERENCES "SessionDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

