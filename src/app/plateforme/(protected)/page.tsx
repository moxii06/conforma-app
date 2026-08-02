import { prisma } from "@/lib/prisma";
import { Pill, MetricCard } from "@/components/ui";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { OrganizationAccessActions } from "@/components/OrganizationAccessActions";
import { PlatformAdminLogoutButton } from "@/components/PlatformAdminLogoutButton";

const PLAN_LABELS: Record<string, string> = { solo: "Solo", team: "Team", growth: "Growth" };
const STATUS_LABELS: Record<string, string> = { trialing: "Essai", active: "Actif", past_due: "Impayé", canceled: "Résilié" };
const STATUS_TONES: Record<string, "neutral" | "warn" | "danger" | "good"> = {
  trialing: "warn",
  active: "good",
  past_due: "danger",
  canceled: "neutral",
};

export default async function PlatformAdminOrganizationsPage() {
  const organizations = await prisma.organization.findMany({
    include: { subscription: true, _count: { select: { users: true } } },
    orderBy: { createdAt: "desc" },
  });

  const activeCount = organizations.filter((o) => o.subscription?.status === "active").length;
  const trialingCount = organizations.filter((o) => o.subscription?.status === "trialing").length;
  const pastDueCount = organizations.filter((o) => o.subscription?.status === "past_due").length;
  const suspendedCount = organizations.filter((o) => o.suspendedAt).length;

  return (
    <div className="min-h-screen bg-mist">
      <div className="flex items-center justify-between px-8 pt-6 pb-4">
        <div>
          <div className="text-[15px] font-semibold text-ink">Organismes clients</div>
          <div className="text-[12.5px] text-slate mt-0.5">Vue plateforme — hors périmètre d'un organisme</div>
        </div>
        <PlatformAdminLogoutButton />
      </div>
      <div className="px-8 flex gap-3.5 mb-4">
        <MetricCard label="Organismes" value={String(organizations.length)} />
        <MetricCard label="Actifs" value={String(activeCount)} tone="good" />
        <MetricCard label="En essai" value={String(trialingCount)} />
        <MetricCard label="Impayés" value={String(pastDueCount)} tone={pastDueCount > 0 ? "danger" : "ink"} />
        <MetricCard label="Suspendus" value={String(suspendedCount)} tone={suspendedCount > 0 ? "danger" : "ink"} />
      </div>
      <div className="px-8 pb-8">
        <div className="bg-white border border-line rounded-card overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Organisme</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Offre</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Abonnement</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Échéance</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Accès</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const sub = org.subscription;
                const deadline = sub?.status === "trialing" ? sub.trialEndsAt : sub?.currentPeriodEnd;
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{org.name}</div>
                      <div className="text-[11px] text-slate mt-0.5">
                        {org._count.users} membre{org._count.users > 1 ? "s" : ""} · depuis{" "}
                        {format(org.createdAt, "d MMM yyyy", { locale: fr })}
                      </div>
                      {sub?.stripeCustomerId && (
                        <a
                          href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-seal hover:underline"
                        >
                          Voir sur Stripe →
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">{sub ? (PLAN_LABELS[sub.plan] ?? sub.plan) : "—"}</td>
                    <td className="px-4 py-3">
                      {sub ? (
                        <div className="flex flex-col gap-1 items-start">
                          <Pill tone={STATUS_TONES[sub.status] ?? "neutral"}>{STATUS_LABELS[sub.status] ?? sub.status}</Pill>
                          {sub.cancelAtPeriodEnd && <span className="text-[11px] text-rust">Résiliation programmée</span>}
                        </div>
                      ) : (
                        <span className="text-slate">Aucun abonnement</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate whitespace-nowrap">
                      {deadline ? format(deadline, "d MMM yyyy", { locale: fr }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {org.suspendedAt && (
                          <Pill tone="danger">
                            Suspendu {format(org.suspendedAt, "d MMM", { locale: fr })}
                            {org.suspendedReason ? ` — ${org.suspendedReason}` : ""}
                          </Pill>
                        )}
                        {org.accessWarningAt && (
                          <Pill tone="warn">
                            Averti {format(org.accessWarningAt, "d MMM", { locale: fr })}
                            {org.accessWarningReason ? ` — ${org.accessWarningReason}` : ""}
                          </Pill>
                        )}
                        {!org.suspendedAt && !org.accessWarningAt && <span className="text-slate">Normal</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <OrganizationAccessActions
                        organizationId={org.id}
                        isWarned={Boolean(org.accessWarningAt)}
                        isSuspended={Boolean(org.suspendedAt)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {organizations.length === 0 && <div className="text-[12.5px] text-slate px-4 py-4">Aucun organisme.</div>}
        </div>
      </div>
    </div>
  );
}
