import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { METHODE_SOLDE_AUTOMATIQUE } from "@/lib/invoiceEncaissement";
import { advanceOpportunityStage } from "@/lib/pipeline";
import { STAGES_BEFORE_COMPLETION } from "@/lib/pipelineStages";
import { emitWebhook } from "@/lib/webhooks";

// Shared by every place a Payment gets created — manual entry
// (/api/facturation/invoices/[id]/payments), Stripe's webhook, and bank
// reconciliation (/api/facturation/bank/transactions/[id]/confirm): record
// one installment, auto-flip the invoice to PAID once the running total
// covers it, and advance the CRM pipeline the same way picking "Payé" in
// DocStatusSelect would. Kept in one place so the three callers can't drift.
export async function recordInvoicePayment(params: {
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  method?: string | null;
  recordedByUserId?: string | null;
  recordedByName?: string | null;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, organizationId: params.organizationId },
    include: { payments: true },
  });
  if (!invoice) return null;

  // Un règlement RÉEL chasse le solde automatique.
  //
  // Depuis que « marquer payé » écrit lui-même un règlement du solde (voir
  // lib/invoiceStatus.ts), une facture peut être intégralement couverte AVANT
  // qu'un paiement réel n'arrive : un lien Stripe créé puis réglé après coup,
  // un virement rapproché en retard. Ce règlement-là n'est pas une ligne du
  // grand livre, c'est un bouche-trou posé faute de mieux — sa seule raison
  // d'être est qu'aucun encaissement réel n'était enregistré. Dès qu'il en
  // arrive un, il disparaît.
  //
  // Les trois canaux qui passent ici constatent tous de l'argent réellement
  // reçu — saisie manuelle, webhook Stripe, virement rapproché au relevé.
  // Refuser l'un d'eux perdrait la trace d'un encaissement qui a bien eu
  // lieu ; l'ajouter au bouche-trou ferait afficher le double. Le remplacer
  // est la seule réponse juste des trois.
  const soldeAutomatique = invoice.payments.filter((p) => p.method === METHODE_SOLDE_AUTOMATIQUE);
  if (soldeAutomatique.length > 0) {
    await prisma.payment.deleteMany({
      where: { invoiceId: invoice.id, organizationId: params.organizationId, method: METHODE_SOLDE_AUTOMATIQUE },
    });
  }

  const alreadyPaid = invoice.payments
    .filter((p) => p.method !== METHODE_SOLDE_AUTOMATIQUE)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const newTotal = alreadyPaid + params.amountCents;
  const justCompleted = newTotal >= invoice.amountCents && invoice.status !== "PAID";

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        organizationId: params.organizationId,
        invoiceId: invoice.id,
        amountCents: params.amountCents,
        method: params.method || null,
        recordedByUserId: params.recordedByUserId || null,
        recordedByName: params.recordedByName || null,
      },
    }),
    ...(justCompleted ? [prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" as const } })] : []),
  ]);

  if (justCompleted) {
    // Facture soldée = affaire close, quelle que soit l'étape atteinte : un
    // client peut régler avant, pendant ou après la formation.
    await advanceOpportunityStage(
      params.organizationId,
      invoice.contactId,
      STAGES_BEFORE_COMPLETION,
      PipelineStage.COMPLETED,
    );
    // A subrogated funding commitment is settled the moment its invoice is —
    // same "one place, every payment channel" rule as the rest of this
    // function: manual entry, Stripe and a confirmed bank match all land
    // here, so the commitment can never drift out of sync with its invoice.
    await prisma.fundingCommitment.updateMany({
      where: { invoiceId: invoice.id, organizationId: params.organizationId },
      data: { status: "paid" },
    });
    // Fires on the crossing into PAID only, never on later payments against
    // an already-settled invoice — the same guard the opportunity move uses.
    // Placed here rather than in each caller so manual entry, the Stripe
    // webhook and a confirmed bank match all emit it identically.
    await emitWebhook(params.organizationId, "invoice.paid", {
      invoice_id: invoice.id,
      reference: invoice.reference,
      amount_cents: invoice.amountCents,
      paid_cents: newTotal,
      contact_id: invoice.contactId,
    });
  }

  return {
    payment,
    totalPaidCents: newTotal,
    fullyPaid: newTotal >= invoice.amountCents,
    justCompleted,
    /** Un bouche-trou « marquée payée » a été remplacé par ce règlement réel. */
    soldeAutomatiqueRemplace: soldeAutomatique.length > 0,
  };
}
