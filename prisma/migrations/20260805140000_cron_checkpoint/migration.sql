-- CreateTable
CREATE TABLE "CronCheckpoint" (
    "job" TEXT NOT NULL,
    "nextStage" TEXT NOT NULL,
    "runInProgress" BOOLEAN NOT NULL DEFAULT false,
    "stalledRuns" INTEGER NOT NULL DEFAULT 0,
    "lastFullPassAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronCheckpoint_pkey" PRIMARY KEY ("job")
);

