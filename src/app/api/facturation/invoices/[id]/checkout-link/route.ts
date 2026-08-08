import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { createInvoiceCheckoutLink } from "@/lib/stripe";
import { resolveAppOrigin } from "@/lib/appUrl";
import { encaissementFacture } from "@/lib/invoiceEncaissement";

// Stripe refuse toute session de paiement dont le total est inférieur à
// ~0,50 € (montant minimum facturable en euros). Le cas se produit pour de
// vrai : un reliquat de 0,30 € après un acompte, un arrondi de TVA. Sans ce
// garde-fou, la création partait chez Stripe, levait, et la route renvoyait
// un 502 portant le message brut de Stripe en anglais, affiché tel quel à
// l'utilisateur — alors que ce n'est pas une panne mais une situation
// métier normale, à traiter par un encaissement manuel.
const STRIPE_MONTANT_MINIMUM_CENTS = 50;
const MESSAGE_SOLDE_TROP_FAIBLE =
  "Solde trop faible pour un paiement en ligne (minimum 0,50 € chez Stripe) : à encaisser manuellement, puis à saisir via « Enregistrer un paiement ».";

// Le code d'erreur Stripe, quand il y en a un. Lu défensivement : l'erreur
// remonte en `unknown` et n'est pas forcément une erreur Stripe.
function codeErreurStripe(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

// Generates a real Stripe Checkout link on the organization's OWN Stripe
// account (see stripe.ts for why this is per-org, not platform-level) for
// staff to copy and send to the client. No automated delivery — same
// "link generated, human relays it" pattern as every other unsent-email
// flow in this app.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "invoicing") === "none") {
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
  // Le helper partagé plutôt qu'un reduce local : c'est la même définition
  // d'« encaissé » que /facturation et la fiche contact, repli compris.
  const { resteDuCents: remainingCents } = encaissementFacture(invoice);
  if (remainingCents <= 0) {
    return NextResponse.json({ error: "Cette facture est déjà entièrement réglée." }, { status: 400 });
  }
  if (remainingCents < STRIPE_MONTANT_MINIMUM_CENTS) {
    return NextResponse.json({ error: MESSAGE_SOLDE_TROP_FAIBLE }, { status: 400 });
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
    // Filet de sécurité : si Stripe refuse quand même le montant (minimum
    // révisé de leur côté), l'utilisateur lit la même phrase métier plutôt
    // que le message brut en anglais.
    if (codeErreurStripe(err) === "amount_too_small") {
      return NextResponse.json({ error: MESSAGE_SOLDE_TROP_FAIBLE }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur Stripe inattendue." }, { status: 502 });
  }
}
