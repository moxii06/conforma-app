-- CreateTable
CREATE TABLE "ElearningModuleAttachment" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElearningModuleAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElearningModuleAttachment_moduleId_idx" ON "ElearningModuleAttachment"("moduleId");

-- AddForeignKey
ALTER TABLE "ElearningModuleAttachment" ADD CONSTRAINT "ElearningModuleAttachment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ElearningModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

