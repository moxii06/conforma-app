import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceOpportunityStage } from "@/lib/pipeline";

// Ce qu'« envoyer un devis » veut dire, en un seul endroit.
//
// Envoyer un devis n'est pas joindre un PDF : c'est un jalon commercial.
// Le statut passe à SENT et l'affaire correspondante avance à « Devis
// envoyé » — sans quoi le commercial devrait penser à déplacer l'étape à
// la main, ce qu'il oubliera.
//
// Deux écrans déclenchent ce même jalon : le changement de statut depuis
// Facturation, et l'envoi du devis en pièce jointe depuis la fiche
// prospect. Écrire la règle deux fois, c'est se garantir qu'un jour l'un
// des deux avancera l'étape et pas l'autre — et personne ne saura lequel
// a raison. D'où cette fonction, que les deux appellent.

/**
 * Marque un devis comme envoyé et fait avancer l'affaire.
 *
 * Idempotent sur l'étape : `advanceOpportunityStage` n'avance que depuis
 * les étapes indiquées, donc renvoyer un devis déjà envoyé ne fait pas
 * reculer une affaire qui aurait entre-temps été signée.
 */
export async function marquerDevisEnvoye(organizationId: string, quote: { id: string; contactId: string }) {
  await prisma.quote.update({ where: { id: quote.id }, data: { status: DocStatus.SENT } });
  await advanceOpportunityStage(organizationId, quote.contactId, [PipelineStage.PROSPECT], PipelineStage.QUOTE_SENT);
}

/**
 * Un devis signé emporte l'affaire jusqu'à « Signé », qu'il ait été
 * marqué envoyé auparavant ou non — d'où les deux étapes de départ.
 */
export async function marquerDevisSigne(organizationId: string, quote: { id: string; contactId: string }) {
  await prisma.quote.update({ where: { id: quote.id }, data: { status: DocStatus.SIGNED } });
  await advanceOpportunityStage(
    organizationId,
    quote.contactId,
    [PipelineStage.PROSPECT, PipelineStage.QUOTE_SENT],
    PipelineStage.CONTRACT_SIGNED,
  );
}
