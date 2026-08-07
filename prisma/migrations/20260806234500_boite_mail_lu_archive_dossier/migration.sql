-- Boite mail : lu/non lu, archivage reversible, rattachement a un dossier.
--
-- readAt : a l'echelle de l'ORGANISME, pas par utilisateur. Une boite mail
-- d'organisme est partagee, et « Marie l'a deja lu » est precisement ce que
-- l'equipe a besoin de savoir. Un lu par personne aurait demande une table
-- de lectures et repondu a une autre question.
--
-- dossierId : le lien CONFIRME vers un dossier de formation, a distinguer de
-- suggestedDossierId qui n'est qu'une hypothese calculee a la synchronisation
-- et qui etait effacee des qu'on rattachait le contact — si bien que le lien
-- n'etait jamais pose nulle part.
--
-- Aucun champ d'archivage ici : ignoredAt existait deja et faisait exactement
-- cela. Il est seulement rebaptise a l'ecran et rendu reversible.
-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

