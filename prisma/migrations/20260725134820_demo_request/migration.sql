-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organizationName" TEXT NOT NULL,
    "orgSize" TEXT,
    "currentTool" TEXT,
    "timeline" TEXT,
    "message" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoRequest_email_idx" ON "DemoRequest"("email");

