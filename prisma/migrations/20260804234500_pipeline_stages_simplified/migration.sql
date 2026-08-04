-- Audit P1 : fusion des trois étapes financières du pipeline commercial
-- (TO_INVOICE / INVOICED / PAID) en une seule étape terminale COMPLETED.
--
-- Recréation du type plutôt qu'un ALTER TYPE ... ADD VALUE suivi d'un
-- UPDATE : PostgreSQL refuse d'utiliser une valeur d'enum fraîchement
-- ajoutée dans la même transaction, et Prisma exécute chaque migration
-- dans une transaction. Le CASE de la clause USING fait la conversion des
-- données existantes au moment même du changement de type — aucune ligne
-- ne se retrouve orpheline.
CREATE TYPE "PipelineStage_new" AS ENUM ('PROSPECT', 'QUOTE_SENT', 'CONTRACT_SIGNED', 'SESSION_SCHEDULED', 'COMPLETED');

ALTER TABLE "Opportunity" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "Opportunity"
  ALTER COLUMN "stage" TYPE "PipelineStage_new"
  USING (
    CASE
      WHEN "stage"::text IN ('TO_INVOICE', 'INVOICED', 'PAID') THEN 'COMPLETED'
      ELSE "stage"::text
    END
  )::"PipelineStage_new";

ALTER TABLE "Opportunity" ALTER COLUMN "stage" SET DEFAULT 'PROSPECT';

DROP TYPE "PipelineStage";

ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";
