-- Date de reprise du « à faire » : rien d'antérieur ne remonte comme tâche.
-- Remplace un mécanisme de rejet ligne par ligne qui ne pouvait pas être
-- exact au-delà du plafond par famille (voir le commentaire du schéma).

ALTER TABLE "Organization" ADD COLUMN "tasksHiddenBefore" TIMESTAMP(3);
