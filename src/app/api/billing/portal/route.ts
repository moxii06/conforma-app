import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { billingConfigured, createBillingPortalSession } from "@/lib/billing";
import { resolveAppOrigin } from "@/lib/appUrl";

// Opens Stripe's Customer Portal: payment method, invoice history, plan
// change, cancellation. All four hosted by Stripe.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Seul l'administrateur peut gérer l'abonnement." }, { status: 403 });
  }
  if (!billingConfigured()) {
    return NextResponse.json({ error: "La facturation n'est pas encore activée." }, { status: 503 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { stripeCustomerId: true },
  });
  // No Stripe customer means nothing has ever been paid — there is no
  // portal to open, and sending them to an empty one would be confusing.
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Aucun abonnement payant en cours — souscrivez d'abord une formule." },
      { status: 400 },
    );
  }

  try {
    const url = await createBillingPortalSession(subscription.stripeCustomerId, resolveAppOrigin(request));
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "L'ouverture du portail a échoué." },
      { status: 500 },
    );
  }
}
