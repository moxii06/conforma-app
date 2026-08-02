-- Contrôle d'accès manuel par le propriétaire de la plateforme (Jalon),
-- distinct du statut Subscription (qui reflète Stripe). Tout nullable :
-- aucun organisme existant n'est concerné tant que personne n'agit.

ALTER TABLE "Organization"
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT,
  ADD COLUMN "accessWarningAt" TIMESTAMP(3),
  ADD COLUMN "accessWarningReason" TEXT;
