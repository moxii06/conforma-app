-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN     "imapHost" TEXT,
ADD COLUMN     "imapPort" INTEGER,
ADD COLUMN     "passwordEncrypted" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ALTER COLUMN "accessTokenEncrypted" DROP NOT NULL,
ALTER COLUMN "refreshTokenEncrypted" DROP NOT NULL;

