-- CreateTable
CREATE TABLE "NotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDismissal_userId_idx" ON "NotificationDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDismissal_userId_kind_entityId_key" ON "NotificationDismissal"("userId", "kind", "entityId");

-- AddForeignKey
ALTER TABLE "NotificationDismissal" ADD CONSTRAINT "NotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

