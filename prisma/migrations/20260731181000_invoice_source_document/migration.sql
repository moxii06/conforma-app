-- Le document dont l'échéancier a produit cette facture.
--
-- Sert d'abord de garde d'idempotence côté prospect : « une seule série
-- d'échéances par dossier » ne veut rien dire quand il n'y a pas de dossier,
-- et un contact peut signer plusieurs contrats, chacun avec son propre
-- échéancier. Accessoirement, rend traçable d'où vient une échéance.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sourceDocumentId" TEXT;
