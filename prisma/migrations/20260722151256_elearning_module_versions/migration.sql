-- CreateTable
CREATE TABLE "ElearningModuleVersion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedByName" TEXT NOT NULL,

    CONSTRAINT "ElearningModuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElearningModuleVersion_moduleId_idx" ON "ElearningModuleVersion"("moduleId");

-- AddForeignKey
ALTER TABLE "ElearningModuleVersion" ADD CONSTRAINT "ElearningModuleVersion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ElearningModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

