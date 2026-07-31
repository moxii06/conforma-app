-- Le registre des traitements ne portait que trois des sept mentions de
-- l'article 30 : le nom, la base légale et la durée de conservation.
-- Manquaient la finalité, les catégories de personnes et de données, les
-- destinataires, les transferts hors UE et les mesures de sécurité — soit
-- tout ce qui rend un registre opposable.
--
-- Les colonnes sont nullables pour que les lignes déjà saisies survivent
-- telles quelles ; l'écran les signale « à compléter » plutôt que de les
-- présenter comme complètes.

ALTER TABLE "ProcessingActivity" ADD COLUMN     "dataCategories" TEXT,
ADD COLUMN     "dataSubjects" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "recipients" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "securityMeasures" TEXT,
ADD COLUMN     "transferDetails" TEXT,
ADD COLUMN     "transferOutsideEu" BOOLEAN NOT NULL DEFAULT false;

-- La base légale devient une liste fermée (les six de l'article 6) au lieu
-- d'un champ texte. On rattache les formulations françaises courantes déjà
-- saisies, sans toucher à ce qui ne correspond à rien : requalifier un
-- traitement à tort est exactement ce qu'un registre ne doit pas faire, et
-- l'affichage sait rendre une valeur libre telle quelle.
--
-- translate() plutôt que unaccent() : l'extension n'est pas garantie
-- présente sur la base de production, et une migration qui échoue au
-- déploiement bloquerait tout le build.
UPDATE "ProcessingActivity" SET "legalBasis" = CASE
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('execution du contrat', 'contrat', 'relation contractuelle') THEN 'contract'
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('obligation legale', 'obligations legales') THEN 'legal_obligation'
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('consentement', 'accord') THEN 'consent'
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('interet legitime', 'interets legitimes') THEN 'legitimate_interest'
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('mission d''interet public', 'interet public') THEN 'public_task'
  WHEN lower(translate("legalBasis", 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) IN ('interets vitaux', 'sauvegarde des interets vitaux') THEN 'vital_interests'
  ELSE "legalBasis"
END;
