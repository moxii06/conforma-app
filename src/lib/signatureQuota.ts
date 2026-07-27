import { prisma } from "@/lib/prisma";

// Solo (39€/mois) is the only plan with a signature cap — Team and Growth's
// higher price already assumes real usage, no metering needed there. This
// protects Jalon's own signature allowance (see the Yousign partner-pricing
// context this was built for) regardless of whether a given org later
// brings its own Yousign key (src/lib/yousign.ts's IntegrationCredential)
// or keeps using Jalon's: the cap is on requests sent through Jalon, not
// on whichever account ends up processing them downstream.
export const SOLO_MONTHLY_SIGNATURE_LIMIT = 15;

export type SignatureQuota = { allowed: boolean; used: number; limit: number | null };

// Counted live from Document rows rather than a stored counter — same
// "recompute, don't accumulate" choice as DashboardTaskDismissal elsewhere
// in this schema, and it means a counter can never drift from what actually
// happened. signatureStatus is set at send time in
// /api/dossiers/[id]/documents/send, so this counts requests sent this
// calendar month regardless of whether they've since been signed.
export async function checkSignatureQuota(organizationId: string): Promise<SignatureQuota> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
  if (subscription?.plan !== "solo") return { allowed: true, used: 0, limit: null };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const used = await prisma.document.count({
    where: { organizationId, signatureStatus: { not: "none" }, createdAt: { gte: monthStart } },
  });
  return { allowed: used < SOLO_MONTHLY_SIGNATURE_LIMIT, used, limit: SOLO_MONTHLY_SIGNATURE_LIMIT };
}
