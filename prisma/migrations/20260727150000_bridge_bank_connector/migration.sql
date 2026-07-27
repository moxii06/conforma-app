-- DropIndex
DROP INDEX "BankConnection_organizationId_requisitionId_key";

-- AlterTable
ALTER TABLE "BankConnection" DROP COLUMN "requisitionId",
ADD COLUMN     "externalConnectionId" TEXT NOT NULL,
ALTER COLUMN "provider" SET DEFAULT 'bridge';

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_organizationId_externalConnectionId_key" ON "BankConnection"("organizationId", "externalConnectionId");
