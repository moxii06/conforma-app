import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { createInvoiceCheckoutLink } from "@/lib/stripe";
import { resolveAppOrigin } from "@/lib/appUrl";

// Generates a real Stripe Checkout link on the organization's OWN Stripe
// account (see stripe.ts for why this is per-org, not platform-level) for
// staff to copy and send to the client. No automated delivery — same
// "link generated, human relays it" pattern as every other unsent-email
// flow in this app.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "invoicing") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  // Solde restant, pas le montant total : un acompte déjà encaissé (saisie
  // manuelle ou rapprochement bancaire) ne fait pas automatiquement passer
  // la facture à PAID, donc ce bouton doit rester utilisable sur une facture
  // SENT partiellement réglée — même calcul que RecordPaymentForm à l'écran.
  const totalPaidCents = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
  const remainingCents = Math.max(0, invoice.amountCents - totalPaidCents);
  if (remainingCents <= 0) {
    return NextResponse.json({ error: "Cette facture est déjà entièrement réglée." }, { status: 400 });
  }

  const origin = resolveAppOrigin(request);

  try {
    const result = await createInvoiceCheckoutLink({
      organizationId: auth.organizationId,
      invoiceId: invoice.id,
      amountCents: remainingCents,
      reference: invoice.reference,
      successUrl: `${origin}/facturation?tab=factures&paid=1`,
      cancelUrl: `${origin}/facturation?tab=factures`,
    });
    if ("notConfigured" in result) {
      return NextResponse.json({ error: "Stripe n'est pas configuré pour cette organisation (voir /integrations)." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur Stripe inattendue." }, { status: 502 });
  }
}
