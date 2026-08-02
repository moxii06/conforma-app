import { prisma } from "@/lib/prisma";
import { Pill, MetricCard } from "@/components/ui";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { OrganizationAccessActions } from "@/components/OrganizationAccessActions";
import { PlatformAdminLogoutButton } from "@/components/PlatformAdminLogoutButton";
import { AddOrganizationForm } from "@/components/AddOrganizationForm";
import { billingConfigured, fetchPlanPrices, type PlanKey } from "@/lib/billing";

const PLAN_LABELS: Record<string, string> = { solo: "Solo", team: "Team", growth: "Growth" };
const STATUS_LABELS: Record<string, string> = { trialing: "Essai", active: "Actif", past_due: "Impayé", canceled: "Résilié" };
const STATUS_TONES: Record<string, "neutral" | "warn" | "danger" | "good"> = {
  trialing: "warn",
  active: "good",
  past_due: "danger",
  canceled: "neutral",
};
const PLAN_KEYS: PlanKey[] = ["solo", "team", "growth"];
const ACTIVITY_DOT_CLASSES: Record<"sage" | "seal" | "slate", string> = {
  sage: "bg-sage",
  seal: "bg-seal-light",
  slate: "bg-ash",
};

// Qualité = client payant (abonnement actif) ou prospect (tout le reste :
// essai, impayé, résilié, ou aucun abonnement) — dérivée, jamais saisie,
// pour qu'elle ne puisse jamais diverger du statut réel de l'abonnement.
function isClientOrg(org: { subscription: { status: string } | null }): boolean {
  return org.subscription?.status === "active";
}

export default async function PlatformAdminOrganizationsPage(props: {
  searchParams: Promise<{ qualite?: string }>;
}) {
  const searchParams = await props.searchParams;
  const qualiteFilter = searchParams.qualite === "prospect" || searchParams.qualite === "client" ? searchParams.qualite : null;

  const organizations = await prisma.organization.findMany({
    include: { subscription: true, _count: { select: { users: true } } },
    orderBy: { createdAt: "desc" },
  });

  const activeCount = organizations.filter((o) => o.subscription?.status === "active").length;
  const trialingCount = organizations.filter((o) => o.subscription?.status === "trialing").length;
  const pastDueCount = organizations.filter((o) => o.subscription?.status === "past_due").length;
  const suspendedCount = organizations.filter((o) => o.suspendedAt).length;

  // Le filtre ne touche que le tableau et la frise d'activité ci-dessous —
  // les compteurs et le résumé financier au-dessus restent globaux, pour ne
  // jamais donner l'impression que le MRR a changé parce qu'on a filtré.
  const visibleOrganizations = organizations.filter((org) => {
    if (qualiteFilter === "client") return isClientOrg(org);
    if (qualiteFilter === "prospect") return !isClientOrg(org);
    return true;
  });

  // Revenu de Jalon lui-même (ce que ses clients OFP lui paient) — jamais à
  // confondre avec l'argent qui transite par /facturation, qui appartient à
  // chaque organisme pour SES propres clients. Estimé sur les tarifs
  // catalogue actuels (fetchPlanPrices, la même source que /abonnement côté
  // OFP) plutôt que sur ce que Stripe facture réellement à chaque client :
  // simple, cohérent avec le reste de l'app, et suffisant tant qu'aucun
  // tarif négocié individuellement n'existe.
  const financeEnabled = billingConfigured();
  const prices = financeEnabled ? await fetchPlanPrices() : null;
  const currency = (prices?.solo ?? prices?.team ?? prices?.growth)?.currency ?? "eur";

  function revenueByStatus(status: string) {
    const byPlan: Record<PlanKey, { count: number; cents: number }> = {
      solo: { count: 0, cents: 0 },
      team: { count: 0, cents: 0 },
      growth: { count: 0, cents: 0 },
    };
    let totalCents = 0;
    for (const org of organizations) {
      const sub = org.subscription;
      if (!sub || sub.status !== status) continue;
      const planKey = sub.plan as PlanKey;
      if (!byPlan[planKey]) continue;
      const cents = prices?.[planKey]?.amountCents ?? 0;
      byPlan[planKey].count += 1;
      byPlan[planKey].cents += cents;
      totalCents += cents;
    }
    return { totalCents, byPlan };
  }

  function formatCents(cents: number): string {
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: currency.toUpperCase() });
  }

  const activeRevenue = financeEnabled ? revenueByStatus("active") : null;
  const pastDueRevenue = financeEnabled ? revenueByStatus("past_due") : null;
  // billingConfigured() only checks that the key is present, not that every
  // plan's price actually resolved (a missing STRIPE_PRICE_* env var or an
  // unreachable Stripe price both leave prices[key] null — see
  // fetchPlanPrices's own comment). Silently treating that as "0 €" would
  // understate MRR without any visible sign something's wrong, so a plan
  // that has active subscribers but no resolved price is called out.
  const missingPricePlans = activeRevenue
    ? PLAN_KEYS.filter((key) => activeRevenue.byPlan[key].count > 0 && !prices?.[key])
    : [];

  // Frise "Activité récente", tous organismes confondus — pour repérer d'un
  // coup d'œil qui n'a pas eu de nouvelles depuis longtemps, plutôt que de
  // devoir ouvrir chaque fiche une par une. Même fusion email+note que sur
  // la fiche organisme, avec l'organisme d'origine en plus sur chaque ligne.
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const [recentEmails, recentNotes] = await Promise.all([
    prisma.platformEmailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.platformContactNote.findMany({ orderBy: { occurredAt: "desc" }, take: 50 }),
  ]);
  const globalActivity = [
    ...recentEmails.map((msg) => ({
      id: `email-${msg.id}`,
      organizationId: msg.organizationId,
      at: msg.sentAt ?? msg.scheduledAt ?? msg.createdAt,
      text: msg.sentAt ? `Email envoyé — ${msg.subject}` : `Email programmé — ${msg.subject}`,
      dot: (msg.sentAt ? "sage" : "seal") as "sage" | "seal" | "slate",
    })),
    ...recentNotes.map((n) => ({
      id: `note-${n.id}`,
      organizationId: n.organizationId,
      at: n.occurredAt,
      text: n.note,
      dot: "slate" as "sage" | "seal" | "slate",
    })),
  ]
    .filter((e) => {
      const org = orgById.get(e.organizationId);
      if (!org) return false;
      if (qualiteFilter === "client") return isClientOrg(org);
      if (qualiteFilter === "prospect") return !isClientOrg(org);
      return true;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 20);

  return (
    <div className="min-h-screen bg-mist">
      <div className="flex items-center justify-between px-8 pt-6 pb-4">
        <div>
          <div className="text-[15px] font-semibold text-ink">Organismes clients</div>
          <div className="text-[12.5px] text-slate mt-0.5">Vue plateforme — hors périmètre d'un organisme</div>
        </div>
        <PlatformAdminLogoutButton />
      </div>
      <div className="px-8 flex items-start justify-between gap-4 mb-4">
        <div className="flex gap-3.5">
          <MetricCard label="Organismes" value={String(organizations.length)} />
          <MetricCard label="Actifs" value={String(activeCount)} tone="good" />
          <MetricCard label="En essai" value={String(trialingCount)} />
          <MetricCard label="Impayés" value={String(pastDueCount)} tone={pastDueCount > 0 ? "danger" : "ink"} />
          <MetricCard label="Suspendus" value={String(suspendedCount)} tone={suspendedCount > 0 ? "danger" : "ink"} />
        </div>
        <AddOrganizationForm />
      </div>
      <div className="px-8 pb-4 flex items-center gap-1">
        {[
          { key: null, label: "Tous" },
          { key: "prospect", label: "Prospects" },
          { key: "client", label: "Clients" },
        ].map((opt) => (
          <Link
            key={opt.label}
            href={opt.key ? `/plateforme?qualite=${opt.key}` : "/plateforme"}
            className={`text-[12px] px-2.5 py-1 rounded-full ${
              qualiteFilter === opt.key ? "bg-ink text-white" : "text-slate hover:text-ink"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>
      <div className="px-8 pb-4">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[13px] font-semibold text-ink">Résumé financier</div>
            {financeEnabled && (
              <div className="text-[11px] text-slate">Estimation sur la base des tarifs catalogue actuels</div>
            )}
          </div>
          {!financeEnabled || !activeRevenue || !pastDueRevenue ? (
            <div className="text-[12.5px] text-slate">
              Indisponible — configurez STRIPE_PLATFORM_SECRET_KEY et les tarifs (STRIPE_PRICE_*) pour l&apos;activer.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-8 mb-4">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold">MRR</div>
                  <div className="text-2xl font-mono font-semibold tabular-nums text-ink">{formatCents(activeRevenue.totalCents)}</div>
                  <div className="text-[11px] text-slate mt-0.5">
                    par mois · {activeCount} abonnement{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold">ARR</div>
                  <div className="text-2xl font-mono font-semibold tabular-nums text-ink">{formatCents(activeRevenue.totalCents * 12)}</div>
                  <div className="text-[11px] text-slate mt-0.5">projection annuelle</div>
                </div>
                {pastDueRevenue.totalCents > 0 && (
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide text-rust font-semibold">À risque</div>
                    <div className="text-2xl font-mono font-semibold tabular-nums text-rust">{formatCents(pastDueRevenue.totalCents)}</div>
                    <div className="text-[11px] text-slate mt-0.5">
                      impayés · {pastDueCount} abonnement{pastDueCount > 1 ? "s" : ""}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 pt-3.5 border-t border-line">
                {PLAN_KEYS.map((key) => (
                  <div key={key}>
                    <div className="text-[12px] text-ink font-medium">{PLAN_LABELS[key]}</div>
                    <div className="text-[11.5px] text-slate">
                      {activeRevenue.byPlan[key].count} actif{activeRevenue.byPlan[key].count > 1 ? "s" : ""} ·{" "}
                      {formatCents(activeRevenue.byPlan[key].cents)}/mois
                    </div>
                  </div>
                ))}
              </div>
              {missingPricePlans.length > 0 && (
                <div className="text-[11px] text-rust mt-2.5">
                  Tarif introuvable pour {missingPricePlans.map((k) => PLAN_LABELS[k]).join(", ")} — total probablement
                  sous-estimé.
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="px-8 pb-8">
        <div className="bg-white border border-line rounded-card overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Organisme</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Qualité</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Offre</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Revenu mensuel</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Abonnement</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Échéance</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Accès</th>
                <th className="text-left font-semibold text-slate text-[11px] uppercase tracking-wide px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrganizations.map((org) => {
                const sub = org.subscription;
                const deadline = sub?.status === "trialing" ? sub.trialEndsAt : sub?.currentPeriodEnd;
                const orgPriceCents = sub ? (prices?.[sub.plan as PlanKey]?.amountCents ?? null) : null;
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0 align-top">
                    <td className="px-4 py-3">
                      <Link href={`/plateforme/organisations/${org.id}`} className="font-semibold text-ink hover:text-seal hover:underline">
                        {org.name}
                      </Link>
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
                    <td className="px-4 py-3">
                      <Pill tone={isClientOrg(org) ? "good" : "neutral"}>{isClientOrg(org) ? "Client" : "Prospect"}</Pill>
                    </td>
                    <td className="px-4 py-3 text-ink">{sub ? (PLAN_LABELS[sub.plan] ?? sub.plan) : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {orgPriceCents == null ? (
                        <span className="text-slate">—</span>
                      ) : (
                        <span
                          className={
                            sub?.status === "active"
                              ? "text-ink font-medium"
                              : sub?.status === "past_due"
                                ? "text-rust"
                                : "text-slate"
                          }
                        >
                          {formatCents(orgPriceCents)}/mois
                        </span>
                      )}
                    </td>
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
          {visibleOrganizations.length === 0 && (
            <div className="text-[12.5px] text-slate px-4 py-4">
              {qualiteFilter ? "Aucun organisme dans cette catégorie." : "Aucun organisme."}
            </div>
          )}
        </div>
      </div>

      <div className="px-8 pb-8">
        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-baseline justify-between mb-3.5">
            <div className="text-[13px] font-semibold text-ink">Activité récente</div>
            <div className="text-[12px] text-slate">tous organismes{qualiteFilter ? ` — ${qualiteFilter === "client" ? "clients" : "prospects"}` : ""}</div>
          </div>
          <div className="flex flex-col">
            {globalActivity.map((e, i) => {
              const org = orgById.get(e.organizationId);
              return (
                <div key={e.id} className="flex gap-3 pb-4 relative">
                  {i < globalActivity.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" />}
                  <span className={`w-[11px] h-[11px] rounded-full mt-0.5 shrink-0 z-10 ${ACTIVITY_DOT_CLASSES[e.dot]}`} />
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-ink leading-snug whitespace-pre-wrap">
                      {org && (
                        <Link href={`/plateforme/organisations/${org.id}`} className="font-medium text-ink hover:text-seal hover:underline">
                          {org.name}
                        </Link>
                      )}
                      {org ? " — " : ""}
                      {e.text}
                    </div>
                    <div className="text-[11px] text-slate mt-0.5">{format(e.at, "d MMM yyyy", { locale: fr })}</div>
                  </div>
                </div>
              );
            })}
            {globalActivity.length === 0 && (
              <div className="text-[12.5px] text-slate">Aucune activité pour l&apos;instant.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
