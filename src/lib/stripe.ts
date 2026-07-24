import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// Stripe is per-organization, not a Jalon-owned platform credential like
// AI/Brevo — each OFP receives payment from their own training clients into
// their own Stripe account; Jalon must never sit in that money flow (the
// user explicitly corrected an earlier assumption to the contrary — see
// README). The key lives in IntegrationCredential same as Yousign/Pennylane
// etc., encrypted at rest. `clientSecret` on that row is repurposed here as
// the Stripe webhook signing secret (whsec_...) rather than an OAuth
// client secret — there's no OAuth flow for Stripe in this app, just an API
// key pasted on /integrations, so the field was free to reuse rather than
// adding a fifth IntegrationCredential column for one provider.
async function getOrgStripeContext(organizationId: string) {
  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider: "stripe" } },
  });
  if (!credential?.apiKey) return null;
  const client = new Stripe(decrypt(credential.apiKey));
  return { client, credential };
}

export async function isStripeConfigured(organizationId: string): Promise<boolean> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider: "stripe" } },
  });
  return Boolean(credential?.apiKey);
}

// Creates a Stripe-hosted Checkout Session for one invoice, on the org's
// own Stripe account. There's no automated email delivery of this link
// (matches the rest of this app's "generate a link, staff relays it"
// pattern for anything without a dedicated send flow) — staff copies the
// returned URL to the client themselves.
export async function createInvoiceCheckoutLink(params: {
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  reference: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | { notConfigured: true }> {
  const ctx = await getOrgStripeContext(params.organizationId);
  if (!ctx) return { notConfigured: true };

  const session = await ctx.client.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: params.amountCents,
          product_data: { name: `Facture ${params.reference}` },
        },
        quantity: 1,
      },
    ],
    metadata: { organizationId: params.organizationId, invoiceId: params.invoiceId },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe n'a pas renvoyé de lien de paiement.");
  return { url: session.url };
}

// Verifies a webhook payload against the org's own signing secret before
// trusting it — the organizationId comes from the URL path (see
// /api/webhooks/stripe/[organizationId]), which is how the route knows
// which org's key/secret to check in the first place, before the payload
// itself can be trusted at all.
export async function verifyStripeWebhook(organizationId: string, rawBody: string, signature: string): Promise<Stripe.Event> {
  const ctx = await getOrgStripeContext(organizationId);
  if (!ctx) throw new Error("Stripe non configuré pour cette organisation.");
  if (!ctx.credential.clientSecret) throw new Error("Secret de signature du webhook non configuré.");
  return ctx.client.webhooks.constructEvent(rawBody, signature, decrypt(ctx.credential.clientSecret));
}
