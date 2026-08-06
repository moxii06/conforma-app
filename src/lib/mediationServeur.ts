import { prisma } from "@/lib/prisma";
import type { EtatMediation } from "@/lib/mediationConsommation";

// La seule requête qui alimente la règle de mediationConsommation.ts.
//
// Séparée d'elle pour que la règle reste pure et testable : trois compteurs
// et un booléen, aucune décision ici. Ce fichier ne sait pas ce qu'est une
// obligation, il sait seulement où lire ce qui la déclenche.

/**
 * Le signal se lit sur ce que l'organisme a FAIT, jamais sur ce qu'il a
 * déclaré. Deux traces suffisent, écrites par l'application au moment de
 * l'acte :
 *  - un contrat de formation « particulier » (art. L.6353-3 : la personne
 *    physique qui finance elle-même) ;
 *  - une facture dont le financement est l'apprenant lui-même — le cas de
 *    l'échéancier matérialisé à la signature, ou d'une saisie manuelle.
 *
 * `take: 1` sur chacune : on cherche l'existence, pas le volume. Une seule
 * vente à un particulier suffit à faire naître l'obligation, et compter des
 * milliers de lignes pour répondre « au moins une » serait du gaspillage sur
 * une page ouverte à chaque visite.
 */
export async function chargerEtatMediation(organizationId: string): Promise<EtatMediation> {
  const [organization, contrat, facture] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { mediatorName: true, mediatorReminderSnoozedUntil: true },
    }),
    prisma.document.findFirst({
      where: { organizationId, category: "contrat_formation" },
      select: { id: true },
    }),
    prisma.invoice.findFirst({
      where: { organizationId, fundingOrigin: "individual" },
      select: { id: true },
    }),
  ]);

  return {
    mediateurRenseigne: Boolean(organization.mediatorName?.trim()),
    signal: {
      contratsParticulier: contrat ? 1 : 0,
      facturesFondsPropres: facture ? 1 : 0,
    },
    reporteJusquA: organization.mediatorReminderSnoozedUntil,
  };
}
