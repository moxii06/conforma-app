import Stripe from "stripe";
import { FORMULES, trouverFormule, type CleFormule } from "@/lib/tarifs";

// Jalon's OWN subscription billing — deliberately separate from
// src/lib/stripe.ts, which handles each OF charging THEIR clients on THEIR
// own Stripe account. Two different accounts, two different money flows,
// two different sets of credentials; merging them would be one refactor
// away from an OF's training revenue landing in Jalon's account.
//
// Ce fichier ne décrit plus les offres : il ne fait plus que la plomberie
// Stripe. Le catalogue (libellés, prix public, limites, contenu) vit dans
// lib/tarifs.ts, importé ici pour la seule chose dont Stripe a besoin — le nom
// de la variable d'environnement portant l'id de Price. `PlanKey` reste
// exporté sous ce nom parce que /plateforme et la route checkout l'importent
// d'ici ; c'est désormais un alias de `CleFormule`.

export type PlanKey = CleFormule;

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_PLATFORM_SECRET_KEY);
}

export function priceIdForPlan(plan: PlanKey): string | null {
  const formule = trouverFormule(plan);
  if (!formule) return null;
  return process.env[formule.variablePrixStripe] || null;
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
 * configured or the price is missing.
 *
 * Ce null n'est PAS « prix inconnu, n'affiche rien » : /abonnement retombe
 * alors sur le tarif public de lib/tarifs.ts, explicitement étiqueté
 * « indicatif » à l'écran (voir `resoudrePrixMensuelCents`). La règle du
 * paragraphe ci-dessus tient quand même — dès qu'un Price Stripe existe, c'est
 * LUI qui s'affiche, jamais la valeur du catalogue.
 */
export async function fetchPlanPrices(): Promise<Record<PlanKey, { amountCents: number; currency: string } | null>> {
  const empty = { solo: null, team: null, growth: null } as Record<
    PlanKey,
    { amountCents: number; currency: string } | null
  >;
  if (!billingConfigured()) return empty;

  const stripe = client();
  const results = await Promise.allSettled(
    FORMULES.map(async (f) => {
      const id = priceIdForPlan(f.cle);
      if (!id) return { key: f.cle, value: null };
      const price = await stripe.prices.retrieve(id);
      return {
        key: f.cle,
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
