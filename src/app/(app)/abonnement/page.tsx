import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";

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
  const daysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? Math.max(0, differenceInCalendarDays(subscription.trialEndsAt, new Date()))
      : null;

  return (
    <>
      <PageHeader title="Abonnement" subtitle="Votre abonnement Conforma — factures et moyen de paiement" />
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

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-ink">Moyen de paiement</div>
          <div className="text-[12.5px] text-slate">
            Aucun moyen de paiement enregistré. La mise en place du prélèvement et le passage à une formule payante
            seront disponibles ici une fois la facturation en ligne activée pour votre organisme — contactez-nous en
            attendant.
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-5 flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-ink">Historique des factures</div>
          <div className="text-[12.5px] text-slate">
            Aucune facture pour l'instant — vos factures d'abonnement Conforma apparaîtront ici, téléchargeables en
            PDF, dès la première échéance facturée.
          </div>
        </div>

        {subscription && (
          <div className="text-[11.5px] text-slate">
            Organisme créé le {format(subscription.createdAt, "d MMMM yyyy", { locale: fr })}.
          </div>
        )}
      </div>
    </>
  );
}
