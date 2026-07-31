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

/**
 * Moves opportunities to TO_INVOICE once their session has actually been
 * delivered.
 *
 * Every other stage transition is triggered by a document (quote sent,
 * invoice issued, payment recorded), but nothing produces a document at the
 * *end* of a session — so TO_INVOICE, the one stage that means "you are owed
 * money", was only ever reachable by dragging the dropdown by hand. In
 * practice that meant the CRM's "À facturer" column read 0 € forever while
 * delivered work went unbilled.
 *
 * Called from the daily cron rather than at read time: it writes, and the
 * dashboard recomputes its task list on every page load. The matching
 * `session_uninvoiced` task in dashboardTasks.ts is the read-time half — it
 * surfaces the same situation immediately, without waiting for the cron.
 *
 * Returns how many opportunities advanced, for the cron's own log.
 */
export async function advanceDeliveredSessionsToInvoicing(organizationId: string): Promise<number> {
  const delivered = await prisma.session.findMany({
    where: {
      organizationId,
      endsAt: { lt: new Date() },
      status: { not: "CANCELLED" },
      archivedAt: null,
      dossiers: { some: { invoices: { none: { status: { not: "DRAFT" } } } } },
    },
    select: { dossiers: { select: { contactId: true } } },
  });

  const contactIds = [...new Set(delivered.flatMap((s) => s.dossiers.map((d) => d.contactId)))];
  let advanced = 0;
  for (const contactId of contactIds) {
    // Only SESSION_SCHEDULED moves. An opportunity still at QUOTE_SENT hasn't
    // been agreed, and one already at INVOICED/PAID is further along —
    // advanceOpportunityStage's from/to guard enforces exactly that.
    const before = await prisma.opportunity.count({
      where: { organizationId, contactId, stage: PipelineStage.SESSION_SCHEDULED },
    });
    if (before === 0) continue;
    await advanceOpportunityStage(
      organizationId,
      contactId,
      PipelineStage.SESSION_SCHEDULED,
      PipelineStage.TO_INVOICE,
    );
    advanced++;
  }
  return advanced;
}
