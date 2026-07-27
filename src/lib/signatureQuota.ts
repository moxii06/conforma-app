import { prisma } from "@/lib/prisma";

// Re-billing model for e-signatures running on JALON's Yousign partner
// account (see lib/yousign.ts): the Solo plan (39€/mois) includes 10 such
// signatures per calendar month; beyond that nothing is blocked — each
// extra one is counted here and re-billed at OVERAGE_PRICE_CENTS on the
// org's monthly invoice (manually for now: Jalon's own billing isn't wired
// yet, see /abonnement). Team/Growth include unlimited platform signatures.
// Signatures via an org's OWN Yousign key ("yousign_org") or the free
// internal stub are never metered — the org pays Yousign directly, or
// nobody pays anything.
export const SOLO_INCLUDED_SIGNATURES = 10;
export const OVERAGE_PRICE_CENTS = 100;

export type SignatureQuota = {
  // false = unlimited plan (Team/Growth) or no subscription row — nothing
  // to display, nothing to re-bill.
  metered: boolean;
  included: number;
  used: number;
  overage: number;
};

const UNMETERED: SignatureQuota = { metered: false, included: 0, used: 0, overage: 0 };

// Counted live from Document rows rather than a stored counter — same
// "recompute, don't accumulate" choice as DashboardTaskDismissal elsewhere
// in this schema, and it means a counter can never drift from what actually
// happened. Only "yousign_platform" rows count: those are the ones that
// cost Jalon money per signature.
export async function getSignatureQuota(organizationId: string): Promise<SignatureQuota> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
  if (subscription?.plan !== "solo") return UNMETERED;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const used = await prisma.document.count({
    where: { organizationId, signatureProvider: "yousign_platform", createdAt: { gte: monthStart } },
  });
  return { metered: true, included: SOLO_INCLUDED_SIGNATURES, used, overage: Math.max(0, used - SOLO_INCLUDED_SIGNATURES) };
}
