-- CreateTable
CREATE TABLE "DocumentTemplateBlock" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "bodyText" TEXT NOT NULL,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplateBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplateBlock_templateId_idx" ON "DocumentTemplateBlock"("templateId");

-- AddForeignKey
ALTER TABLE "DocumentTemplateBlock" ADD CONSTRAINT "DocumentTemplateBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
