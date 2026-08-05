import { DocStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceOpportunityStage } from "@/lib/pipeline";
import { STAGES_BEFORE_COMPLETION } from "@/lib/pipelineStages";

/**
 * Changer le statut d'une facture — le seul endroit qui sait ce que ça
 * entraîne.
 *
 * Extrait de /api/facturation/invoices/[id] au moment où une seconde route
 * (le changement en masse) a eu besoin du même geste. Deux copies auraient
 * divergé sur l'effet de bord qui compte : passer une facture à « payée »
 * fait avancer l'affaire commerciale correspondante à « terminé ». Un lot
 * qui oublierait cette ligne laisserait le CRM en retard sur la
 * facturation, sans que rien ne le signale.
 *
 * Ce que la fonction ne fait PAS, et c'est délibéré : elle n'enregistre
 * aucun règlement. « Marquer payé » déclare un état ; le montant encaissé
 * se saisit avec le formulaire d'encaissement, qui passe par
 * recordInvoicePayment(). Le geste en masse ne doit ni plus ni moins que
 * le geste unitaire.
 */
export async function appliquerStatutFacture(
  organizationId: string,
  invoiceId: string,
  status: DocStatus
): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
  if (!invoice) return false;

  await prisma.invoice.update({ where: { id: invoice.id }, data: { status } });

  // Audit P1 : l'émission d'une facture ne déplace plus rien dans le CRM —
  // « Facturé » n'est plus une étape commerciale, l'état de la facture se
  // lit en Facturation. Seul l'encaissement complet clôt l'affaire.
  if (status === DocStatus.PAID) {
    await advanceOpportunityStage(organizationId, invoice.contactId, STAGES_BEFORE_COMPLETION, PipelineStage.COMPLETED);
  }
  return true;
}
