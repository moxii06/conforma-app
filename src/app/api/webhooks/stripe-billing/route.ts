import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { verifyBillingWebhook } from "@/lib/billing";

// Jalon's own subscription webhook — distinct from
// /api/webhooks/stripe/[organizationId], which belongs to each OF's own
// Stripe account. Different account, different signing secret, different
// meaning: this one decides whether a customer keeps access.
//
// Stripe is authoritative here. The app never writes `status` itself on the
// strength of "the user clicked subscribe" — a Checkout session that opens
// is not a payment that clears, and treating the two as the same is how an
// unpaid account ends up with full access.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });

  // The raw body, not the parsed JSON: the signature covers the exact bytes
  // Stripe sent, so re-serialising would break verification.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = verifyBillingWebhook(rawBody, signature);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      const plan = session.metadata?.plan;
      if (!organizationId || !plan) break;
      await prisma.subscription.updateMany({
        where: { organizationId },
        data: {
          plan,
          status: "active",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          // The trial is over the moment a real subscription starts;
          // leaving the date would keep the countdown banner running.
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
        },
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) break;
      await prisma.subscription.updateMany({
        where: { organizationId },
        data: {
          // Stripe's vocabulary maps almost one-to-one onto ours; anything
          // unexpected is treated as canceled rather than silently kept
          // active.
          status: mapStripeStatus(sub.status),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: currentPeriodEnd(sub),
          ...(sub.metadata?.plan ? { plan: sub.metadata.plan } : {}),
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      if (!customerId) break;
      // Flagged, not cut off: a failed card is usually an expired card, and
      // Stripe retries for days. Access stays, the UI warns.
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: customerId },
        data: { status: "past_due" },
      });
      break;
    }

    default:
      // Every other event is acknowledged so Stripe stops retrying it.
      break;
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}

// The field moved between Stripe API versions and is absent on some
// subscription shapes — read defensively rather than crash the webhook,
// which would make Stripe retry forever.
function currentPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const raw = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : undefined;
}
