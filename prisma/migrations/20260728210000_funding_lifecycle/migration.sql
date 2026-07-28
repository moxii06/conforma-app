-- AlterTable
ALTER TABLE "FundingCommitment" ADD COLUMN     "depositedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'draft';


-- Existing "requested" rows predate the draft/deposited split. "deposited"
-- is the honest mapping: "requested" meant the ask had been made.
UPDATE "FundingCommitment" SET "status" = 'deposited' WHERE "status" = 'requested';
