import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { getSignatureQuota, OVERAGE_PRICE_CENTS } from "@/lib/signatureQuota";
import { SubscriptionActions } from "@/components/SubscriptionActions";
import { billingConfigured, fetchPlanPrices } from "@/lib/billing";

const PLAN_LABELS: Record<string, string> = { solo: "Solo", team: "Team", growth: "Growth" };
const STATUS_LABELS: Record<string, { label: string; tone: "good" | "warn" | "danger" | "neutral" }> = {
  trialing: { label: "Période d'essai", tone: "warn" },
  active: { label: "Actif", tone: "good" },
  past_due: { label: "Paiement en retard", tone: "danger" },
  canceled: { label: "Résilié", tone: "neutral" },
};

// Billing is the ADMIN_OF's concern per spec §2 — same gate as /integrations.
export default async function AbonnementPage() {
  const { organizationId, role } = await requireSessionContext();
  if (role !== Role.ADMIN_OF) redirect("/dashboard");

  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
  const status = subscription ? STATUS_LABELS[subscription.status] ?? { label: subscription.status, tone: "neutral" as const } : null;
  const signatureQuota = await getSignatureQuota(organizationId);
  const prices = await fetchPlanPrices();
  const daysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? Math.max(0, differenceInCalendarDays(subscription.trialEndsAt, new Date()))
      : null;

  return (
    <>
      <PageHeader title="Abonnement" subtitle="Votre abonnement Jalon — factures et moyen de paiement" />
      <div className="p-8 flex flex-col gap-5 max-w-2xl">
        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink">Formule actuelle</div>
            {status && <Pill tone={status.tone}>{status.label}</Pill>}
          </div>
          {subscription ? (
            <>
              <div className="text-2xl font-display text-ink">{PLAN_LABELS[subscription.plan] ?? subscription.plan}</div>
              {daysLeft !== null && (
                <div className="text-[12.5px] text-slate">
                  {daysLeft > 0
                    ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""} avant la fin de l'essai, sans carte bancaire enregistrée.`
                    : "L'essai se termine aujourd'hui."}
                </div>
              )}
            </>
          ) : (
            <div className="text-[12.5px] text-slate">Aucun abonnement enregistré pour cet organisme.</div>
          )}
        </div>

        {signatureQuota.metered && (
          <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-ink">Signatures électroniques</div>
              <Pill tone={signatureQuota.overage > 0 ? "warn" : "neutral"}>
                {Math.min(signatureQuota.used, signatureQuota.included)} / {signatureQuota.included} incluses ce mois-ci
              </Pill>
            </div>
            <div className="text-[12.5px] text-slate">
              L&apos;offre Solo inclut {signatureQuota.included}
              {" "}demandes de signature électronique par mois via le compte Yousign de Jalon ; au-delà, chaque
              signature est refacturée {(OVERAGE_PRICE_CENTS / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              {" "}HT sur votre facture mensuelle. Les signatures envoyées via votre propre clé Yousign (page
              Intégrations) ne sont pas comptées. Passez à l&apos;offre Team pour un usage illimité.
            </div>
            {signatureQuota.overage > 0 && (
              <div className="text-[12.5px] text-rust">
                {signatureQuota.overage} signature{signatureQuota.overage > 1 ? "s" : ""} hors forfait ce mois-ci —{" "}
                {((signatureQuota.overage * OVERAGE_PRICE_CENTS) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT
                seront refacturés.
              </div>
            )}
          </div>
        )}

        {/* Moyen de paiement, factures, changement de formule et résiliation
            vivent tous dans le portail Stripe — d'où l'absence de sections
            dédiées ici : les reconstruire serait quatre écrans à maintenir
            pour un résultat moins complet. */}
        <SubscriptionActions
          currentPlan={subscription?.plan ?? "solo"}
          hasPaidSubscription={Boolean(subscription?.stripeCustomerId)}
          billingEnabled={billingConfigured()}
          prices={prices}
        />

        {subscription && (
          <div className="text-[11.5px] text-slate">
            Organisme créé le {format(subscription.createdAt, "d MMMM yyyy", { locale: fr })}.
          </div>
        )}
      </div>
    </>
  );
}
