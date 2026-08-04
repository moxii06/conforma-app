-- Audit P1 — boîte mail :
--   syncEnabled  : cocher/décocher une boîte sans la déconnecter (donc sans
--                  effacer ses messages déjà importés).
--   backfilledAt : marque le rattrapage initial des 90 jours d'historique.
--                  NULL sur les connexions existantes, qui déclencheront
--                  donc ce rattrapage à leur prochaine synchronisation.
ALTER TABLE "MailboxConnection" ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MailboxConnection" ADD COLUMN "backfilledAt" TIMESTAMP(3);
