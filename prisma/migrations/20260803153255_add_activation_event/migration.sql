-- CreateTable
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivationEvent_organizationId_idx" ON "ActivationEvent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationEvent_organizationId_type_key" ON "ActivationEvent"("organizationId", "type");

-- AddForeignKey
ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

