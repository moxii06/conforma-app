import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Shared "advance the pipeline automatically" step — used wherever a
// downstream commercial document (quote signed, payment received) implies a
// CRM milestone, so the CRM reflects it without staff having to remember to
// also click the stage dropdown over there (client feedback: "if I mark a
// quote as signed, does that update the CRM?" — it didn't, for anything
// past sending the quote).
//
// `fromStages` is a whitelist, never a single value: it's what stops an
// advance from silently regressing a deal that's already further along, and
// what lets a terminal milestone (a full payment) close out a deal from any
// earlier stage — a client can pay before, during or after the training.
export async function advanceOpportunityStage(
  organizationId: string,
  contactId: string,
  fromStages: PipelineStage[],
  toStage: PipelineStage
) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { organizationId, contactId, stage: { in: fromStages } },
    orderBy: { createdAt: "desc" },
  });
  if (!opportunity) return;

  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: toStage } });

  // Mirrors the manual-stage-change behavior in
  // /api/crm/opportunities/[id]: reaching the terminal stage closes the
  // deal out, so archive the contact — regardless of whether COMPLETED was
  // reached from the CRM dropdown or by a facturation-side event.
  if (toStage === PipelineStage.COMPLETED) {
    await prisma.contact.updateMany({
      where: { id: contactId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }
}

// Audit P1 — advanceDeliveredSessionsToInvoicing() a été retirée avec les
// étapes financières du pipeline. Elle faisait passer une affaire à
// « À facturer » à la fin de la session ; cette étape n'existe plus, et la
// faire basculer à « Terminé » serait faux à deux titres : la formation
// livrée n'est pas encaissée, et atteindre l'étape terminale archive le
// contact — on perdrait de vue un client qu'il reste justement à facturer.
//
// Le besoin réel (« cette session est finie et personne ne l'a facturée »)
// est déjà couvert, mieux et sans délai d'un jour, par la tâche
// `session_uninvoiced` de dashboardTasks.ts : elle se recalcule à chaque
// affichage du tableau de bord et s'affiche dans le thème « Argent ».
