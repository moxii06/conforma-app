import { NextResponse } from "next/server";
import { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyStripeWebhook } from "@/lib/stripe";
import { advanceOpportunityStage } from "@/lib/pipeline";
import type Stripe from "stripe";

// Public endpoint — Stripe calls this directly, no Conforma session
// involved, so the org is identified by the URL path and every event is
// signature-verified against THAT org's own webhook secret before being
// trusted (see verifyStripeWebhook). This is the actual "rapprochement
// automatique" half of the Stripe feature: a completed Checkout Session
// records a real Payment against the invoice named in its metadata and
// auto-flips the invoice to PAID once fully covered — same logic as the
// manual "Enregistrer un paiement" flow (see
// /api/facturation/invoices/[id]/payments), just triggered by Stripe
// instead of a staff member.
export async function POST(request: Request, { params }: { params: { organizationId: string } }) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhook(params.organizationId, rawBody, signature);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;
    const organizationId = session.metadata?.organizationId;
    const amountTotal = session.amount_total;

    if (invoiceId && organizationId === params.organizationId && amountTotal) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: params.organizationId },
        include: { payments: true },
      });
      // Idempotency: Stripe may redeliver the same event — skip if this
      // exact Checkout Session was already reconciled.
      const alreadyRecorded = invoice?.payments.some((p) => p.method === `stripe:${session.id}`);
      if (invoice && !alreadyRecorded) {
        const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
        const newTotal = alreadyPaid + amountTotal;
        const justCompleted = newTotal >= invoice.amountCents && invoice.status !== "PAID";
        await prisma.$transaction([
          prisma.payment.create({
            data: {
              organizationId: params.organizationId,
              invoiceId: invoice.id,
              amountCents: amountTotal,
              method: `stripe:${session.id}`,
              recordedByName: "Stripe (rapprochement automatique)",
            },
          }),
          ...(justCompleted ? [prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" as const } })] : []),
        ]);
        if (justCompleted) {
          await advanceOpportunityStage(params.organizationId, invoice.contactId, PipelineStage.INVOICED, PipelineStage.PAID);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
