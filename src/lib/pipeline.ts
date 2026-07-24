import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Shared "advance the pipeline automatically" step — used wherever a
// downstream commercial document (quote, invoice, payment) implies a CRM
// milestone, so the CRM reflects it without staff having to remember to
// also click the stage dropdown over there (client feedback: "if I mark a
// quote as signed, does that update the CRM?" — it didn't, for anything
// past sending the quote). Only touches an opportunity still sitting at the
// stage right before the target — never regresses one that's already
// further along, and never touches an unrelated deal for the same contact.
export async function advanceOpportunityStage(
  organizationId: string,
  contactId: string,
  fromStage: PipelineStage,
  toStage: PipelineStage
) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { organizationId, contactId, stage: fromStage },
    orderBy: { createdAt: "desc" },
  });
  if (!opportunity) return;

  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: toStage } });

  // Mirrors the manual-stage-change behavior in
  // /api/crm/opportunities/[id]: reaching PAID closes the deal out, so
  // archive the contact — regardless of whether PAID was reached by
  // dragging the CRM dropdown or by a facturation-side event.
  if (toStage === PipelineStage.PAID) {
    await prisma.contact.updateMany({
      where: { id: contactId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }
}
