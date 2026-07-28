import Stripe from "stripe";

// Jalon's OWN subscription billing — deliberately separate from
// src/lib/stripe.ts, which handles each OF charging THEIR clients on THEIR
// own Stripe account. Two different accounts, two different money flows,
// two different sets of credentials; merging them would be one refactor
// away from an OF's training revenue landing in Jalon's account.

export type PlanKey = "solo" | "team" | "growth";

export const PLANS: {
  key: PlanKey;
  label: string;
  tagline: string;
  features: string[];
  /** Env var holding the Stripe Price id. Prices live in Stripe, not here. */
  priceEnvVar: string;
}[] = [
  {
    key: "solo",
    label: "Solo",
    tagline: "Pour un formateur indépendant ou un organisme d'une personne.",
    features: [
      "Catalogue, sessions et dossiers illimités",
      "LMS intégré : vidéos, quiz, attestations",
      "Facturation, devis et relances",
      "Conformité Qualiopi et registre RGPD",
      "10 signatures électroniques incluses par mois",
    ],
    priceEnvVar: "STRIPE_PRICE_SOLO",
  },
  {
    key: "team",
    label: "Team",
    tagline: "Pour un organisme avec plusieurs formateurs et un commercial.",
    features: [
      "Tout ce que contient Solo",
      "Comptes d'équipe et rôles",
      "Boîte mail intégrée et triage",
      "Automatisations de relance par formation",
      "Signatures électroniques illimitées",
    ],
    priceEnvVar: "STRIPE_PRICE_TEAM",
  },
  {
    key: "growth",
    label: "Growth",
    tagline: "Pour un organisme structuré, avec son propre système d'information.",
    features: [
      "Tout ce que contient Team",
      "API publique et webhooks",
      "Rapprochement bancaire",
      "Marque blanche complète",
      "Accompagnement à la migration des données",
    ],
    priceEnvVar: "STRIPE_PRICE_GROWTH",
  },
];

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_PLATFORM_SECRET_KEY);
}

export function priceIdForPlan(plan: PlanKey): string | null {
  const entry = PLANS.find((p) => p.key === plan);
  if (!entry) return null;
  return process.env[entry.priceEnvVar] || null;
}

function client(): Stripe {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!key) throw new Error("STRIPE_PLATFORM_SECRET_KEY non configuré côté serveur.");
  return new Stripe(key);
}

/**
 * Prices are read from Stripe rather than duplicated in code, on purpose:
 * two sources of truth for an amount means the page eventually advertises
 * 49 € while the card is debited 59 €. Returns null when billing isn't
 * configured or the price is missing, and the UI degrades to "sur devis".
 */
export async function fetchPlanPrices(): Promise<Record<PlanKey, { amountCents: number; currency: string } | null>> {
  const empty = { solo: null, team: null, growth: null } as Record<
    PlanKey,
    { amountCents: number; currency: string } | null
  >;
  if (!billingConfigured()) return empty;

  const stripe = client();
  const results = await Promise.allSettled(
    PLANS.map(async (p) => {
      const id = priceIdForPlan(p.key);
      if (!id) return { key: p.key, value: null };
      const price = await stripe.prices.retrieve(id);
      return {
        key: p.key,
        value: price.unit_amount != null ? { amountCents: price.unit_amount, currency: price.currency } : null,
      };
    }),
  );
  for (const r of results) {
    // A single unreachable price must not blank out the whole page.
    if (r.status === "fulfilled") empty[r.value.key] = r.value.value;
  }
  return empty;
}

/**
 * Stripe-hosted Checkout. We never render a card field — the card details
 * never touch Jalon, which keeps the whole PCI question out of this
 * codebase.
 */
export async function createSubscriptionCheckout(params: {
  organizationId: string;
  organizationName: string;
  plan: PlanKey;
  customerEmail: string;
  existingCustomerId: string | null;
  origin: string;
}): Promise<string> {
  const priceId = priceIdForPlan(params.plan);
  if (!priceId) throw new Error(`Aucun tarif Stripe configuré pour la formule ${params.plan}.`);

  const session = await client().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Reuse the customer when one exists so a second subscription doesn't
    // fork the billing history into two Stripe customers.
    ...(params.existingCustomerId
      ? { customer: params.existingCustomerId }
      : { customer_email: params.customerEmail }),
    // The webhook is what actually activates the plan; this metadata is how
    // it knows which organisation to activate.
    metadata: { organizationId: params.organizationId, plan: params.plan },
    subscription_data: {
      metadata: { organizationId: params.organizationId, plan: params.plan },
    },
    // French B2B: the buyer needs to enter their VAT number and get a
    // compliant invoice.
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    success_url: `${params.origin}/abonnement?souscription=ok`,
    cancel_url: `${params.origin}/abonnement?souscription=annulee`,
  });

  if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
  return session.url;
}

/**
 * Stripe's Customer Portal covers payment method, invoice history, plan
 * change and cancellation — all of it hosted, localised and kept up to date
 * by Stripe. Rebuilding those four screens would be weeks of work and a
 * permanent maintenance burden for no gain.
 */
export async function createBillingPortalSession(customerId: string, origin: string): Promise<string> {
  const session = await client().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/abonnement`,
  });
  return session.url;
}

export function verifyBillingWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_PLATFORM_WEBHOOK_SECRET non configuré côté serveur.");
  return client().webhooks.constructEvent(rawBody, signature, secret);
}
