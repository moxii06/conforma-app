-- CreateTable
CREATE TABLE "VirtualClassAttendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "lastPingAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VirtualClassAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VirtualClassAttendance_sessionId_idx" ON "VirtualClassAttendance"("sessionId");

-- CreateIndex
CREATE INDEX "VirtualClassAttendance_dossierId_idx" ON "VirtualClassAttendance"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualClassAttendance_sessionId_dossierId_key" ON "VirtualClassAttendance"("sessionId", "dossierId");

-- AddForeignKey
ALTER TABLE "VirtualClassAttendance" ADD CONSTRAINT "VirtualClassAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualClassAttendance" ADD CONSTRAINT "VirtualClassAttendance_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

