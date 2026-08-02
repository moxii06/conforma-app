-- Numéro de téléphone de facturation — désormais obligatoire à l'inscription
-- (/essai), mais colonne nullable puisque les organismes déjà existants ne
-- l'ont pas renseigné.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "billingPhone" TEXT;
