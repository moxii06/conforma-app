-- Un document envoyé depuis le CRM à un prospect n'avait aucun propriétaire :
-- ni dossierId, ni subcontractorId, ni userId. Conséquences en chaîne —
-- personne n'était prévenu quand le prospect signait, un échéancier signé ne
-- devenait jamais des factures, et le document restait invisible dans la
-- bibliothèque comme sur la fiche contact.
--
-- Deux liens plutôt qu'un : le contact PORTE le document (une opportunité
-- peut être supprimée sans que la convention signée disparaisse — d'où le
-- ON DELETE SET NULL), l'opportunité porte l'étape commerciale à faire
-- avancer au moment de la signature.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "opportunityId" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index : la fiche contact et la bibliothèque listent par propriétaire.
CREATE INDEX "Document_contactId_idx" ON "Document"("contactId");
CREATE INDEX "Document_opportunityId_idx" ON "Document"("opportunityId");
