import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { Role } from "@prisma/client";
import { billingConfigured, createSubscriptionCheckout, type PlanKey } from "@/lib/billing";
import { resolveAppOrigin } from "@/lib/appUrl";

const schema = z.object({ plan: z.enum(["solo", "team", "growth"]) });

// Committing the organisation to a recurring charge is an ADMIN_OF decision
// — not "integrations", not "invoicing": this is the person who signs, and
// /abonnement is already restricted to them.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== Role.ADMIN_OF) {
    return NextResponse.json({ error: "Seul l'administrateur peut souscrire un abonnement." }, { status: 403 });
  }
  if (!billingConfigured()) {
    return NextResponse.json({ error: "La souscription en ligne n'est pas encore activée." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Formule inconnue." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { name: true },
  });
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { stripeCustomerId: true },
  });

  try {
    const url = await createSubscriptionCheckout({
      organizationId: session.organizationId,
      organizationName: organization.name,
      plan: parsed.data.plan as PlanKey,
      customerEmail: session.email,
      existingCustomerId: subscription?.stripeCustomerId ?? null,
      origin: resolveAppOrigin(request),
    });
    return NextResponse.json({ url });
  } catch (err) {
    // Surfaced rather than swallowed: a missing price id is a configuration
    // mistake the admin can do nothing about, and silence would look like
    // the button is broken.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "La création du paiement a échoué." },
      { status: 500 },
    );
  }
}
