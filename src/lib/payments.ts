import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceOpportunityStage } from "@/lib/pipeline";
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

  const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
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
    await advanceOpportunityStage(params.organizationId, invoice.contactId, PipelineStage.INVOICED, PipelineStage.PAID);
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

  return { payment, totalPaidCents: newTotal, fullyPaid: newTotal >= invoice.amountCents, justCompleted };
}
