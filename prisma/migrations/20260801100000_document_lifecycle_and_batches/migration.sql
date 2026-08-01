-- L'espace Documents passe de « une liste » à quatre onglets de cycle de vie.
--
-- status : "draft" | "final". Le défaut 'final' est ce qui rend cette
-- migration sûre sur l'existant — jusqu'ici, un document créé ÉTAIT un
-- document fini, faute de brouillon. Aucune ligne existante ne doit donc
-- basculer en brouillon : elles sont toutes finalisées, et le restent.
--
-- batchId : regroupe les documents nés d'une seule action. Générer un
-- contrat pour une session de 8 apprenants produit 8 documents distincts
-- (un contrat engage une personne nommée, et chacun se signe séparément).
-- Sans cette clé, la question quotidienne de l'organisme — « qui n'a pas
-- encore signé ? » — oblige à ouvrir les 8 fiches une par une.
--
-- Les deux autres états — envoyé, signé — ne sont volontairement PAS
-- stockés : sentByUserId et signatureStatus les portent déjà. Voir
-- src/lib/documentLifecycle.ts.

ALTER TABLE "Document" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'final';

CREATE INDEX "Document_batchId_idx" ON "Document"("batchId");
