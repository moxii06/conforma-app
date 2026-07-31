-- De quoi produire une facture qui tient légalement.
--
-- Manquaient deux choses : la désignation de la prestation (art. 242 nonies A
-- de l'annexe II au CGI — l'objet n'était devinable qu'à travers
-- dossier → session → formation, et une facture directe n'a pas de dossier),
-- et le régime de TVA.
--
-- Le régime par défaut est l'exonération de l'article 261-4-4°a du CGI, qui
-- couvre la formation professionnelle continue et concerne la majorité des
-- organismes déclarés. Ce n'est pas une vérité universelle pour autant :
-- chaque organisme le confirme depuis son profil, parce qu'une facture émise
-- au mauvais régime est une erreur que son client et son comptable subissent
-- tous les deux.

ALTER TABLE "Invoice" ADD COLUMN     "description" TEXT;

ALTER TABLE "Organization" ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "vatRatePercent" DOUBLE PRECISION,
ADD COLUMN     "vatRegime" TEXT NOT NULL DEFAULT 'exempt';

ALTER TABLE "Quote" ADD COLUMN     "description" TEXT;
