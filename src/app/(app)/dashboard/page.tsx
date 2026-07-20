import { prisma } from "@/lib/prisma";
import { MetricCard, PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { BarChart } from "@/components/charts/BarChart";
import { getFollowUpsDue } from "@/lib/followUps";
import { PipelineStage, Role } from "@prisma/client";
import { addWeeks, startOfWeek, format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";

const FOLLOW_UP_KIND_LABELS: Record<string, string> = {
  needs_assessment: "Test de positionnement",
  contract: "Contrat",
  platform_access: "Accès plateforme",
  convocation: "Convocation",
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis",
  CONTRACT_SIGNED: "Signée",
  SESSION_SCHEDULED: "Planifiée",
  INVOICED: "Facturé",
};

export default async function DashboardPage() {
  const { organizationId, role, userId } = await requireSessionContext();

  const subscription =
    role === Role.ADMIN_OF
      ? await prisma.subscription.findUnique({ where: { organizationId } })
      : null;

  const followUps = await getFollowUpsDue(organizationId, role, userId);

  const [
    sessionsInProgress,
    overdueInvoices,
    openNonConformities,
    opportunitiesByStage,
    upcomingSessions,
    needsAssessmentDone,
    contractSigned,
    convocationSent,
    evaluationHotDone,
    evaluationColdDone,
    totalDossiers,
  ] = await Promise.all([
    prisma.session.count({
      where: { organizationId, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    }),
    prisma.invoice.count({ where: { organizationId, status: "OVERDUE" } }),
    prisma.nonConformity.count({ where: { organizationId, status: { not: "resolved" } } }),
    prisma.opportunity.groupBy({ by: ["stage"], where: { organizationId }, _count: true }),
    prisma.session.findMany({
      where: { organizationId, startsAt: { gte: new Date(), lte: addWeeks(new Date(), 6) } },
      select: { startsAt: true },
    }),
    prisma.dossier.count({ where: { organizationId, needsAssessmentDone: true } }),
    prisma.dossier.count({ where: { organizationId, contractSigned: true } }),
    prisma.dossier.count({ where: { organizationId, convocationSent: true } }),
    prisma.dossier.count({ where: { organizationId, evaluationHotDone: true } }),
    prisma.dossier.count({ where: { organizationId, evaluationColdDone: true } }),
    prisma.dossier.count({ where: { organizationId } }),
  ]);

  const stageCounts = new Map(opportunitiesByStage.map((g) => [g.stage, g._count]));
  const pipelineData = Object.values(PipelineStage).map((stage) => ({
    label: STAGE_LABELS[stage],
    value: stageCounts.get(stage) ?? 0,
  }));

  const weekBuckets = Array.from({ length: 6 }, (_, i) => {
    const weekStart = startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 });
    return { weekStart, label: format(weekStart, "d MMM", { locale: fr }), value: 0 };
  });
  for (const s of upcomingSessions) {
    const bucket = weekBuckets.find((w, i) => {
      const next = i + 1 < weekBuckets.length ? weekBuckets[i + 1].weekStart : addWeeks(w.weekStart, 1);
      return s.startsAt >= w.weekStart && s.startsAt < next;
    });
    if (bucket) bucket.value += 1;
  }

  const journeyData = [
    { label: "Besoins", value: needsAssessmentDone },
    { label: "Convention", value: contractSigned },
    { label: "Convocation", value: convocationSent },
    { label: "Éval. chaud", value: evaluationHotDone },
    { label: "Éval. froid", value: evaluationColdDone },
  ];

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble" />
      <div className="p-8 flex flex-col gap-5">
        {subscription?.status === "trialing" && subscription.trialEndsAt && (
          <TrialBanner plan={subscription.plan} trialEndsAt={subscription.trialEndsAt} />
        )}

        {followUps.length > 0 && <FollowUpsWidget followUps={followUps} />}

        <div className="flex gap-3.5">
          <MetricCard label="Sessions en cours" value={String(sessionsInProgress)} />
          <MetricCard label="Factures en retard" value={String(overdueInvoices)} />
          <MetricCard label="Non-conformités ouvertes" value={String(openNonConformities)} />
        </div>

        <div className="flex gap-3.5">
          <div className="bg-white border border-line rounded-card p-4 flex-1">
            <div className="text-[12.5px] text-slate mb-3">Pipeline commercial par étape</div>
            <BarChart data={pipelineData} color="#C99A3E" />
          </div>
          <div className="bg-white border border-line rounded-card p-4 flex-1">
            <div className="text-[12.5px] text-slate mb-3">Sessions programmées (6 prochaines semaines)</div>
            <BarChart data={weekBuckets.map((w) => ({ label: w.label, value: w.value }))} color="#5E7D5B" />
          </div>
        </div>

        <div className="bg-white border border-line rounded-card p-4">
          <div className="text-[12.5px] text-slate mb-3">
            Avancement du parcours apprenant ({totalDossiers} dossier{totalDossiers > 1 ? "s" : ""} au total)
          </div>
          <BarChart data={journeyData} color="#1C2B45" />
        </div>
      </div>
    </>
  );
}

function FollowUpsWidget({ followUps }: { followUps: Awaited<ReturnType<typeof getFollowUpsDue>> }) {
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="text-[12.5px] text-slate mb-3">
        Relances à faire ({followUps.length})
      </div>
      <div className="flex flex-col">
        {followUps.slice(0, 8).map((f) => (
          <Link
            key={`${f.kind}-${f.id}`}
            href={f.href}
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-[#FAF8F2] -mx-1 px-1 rounded"
          >
            <div>
              <span className="text-[12.5px] text-ink font-medium">{f.contactName}</span>
              <span className="text-[12.5px] text-slate"> — {f.label}</span>
            </div>
            <span className="text-[11px] text-slate shrink-0">{FOLLOW_UP_KIND_LABELS[f.kind]}</span>
          </Link>
        ))}
      </div>
      {followUps.length > 8 && (
        <div className="text-[11.5px] text-slate mt-2 pt-2 border-t border-line">
          + {followUps.length - 8} autre{followUps.length - 8 > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = { solo: "Solo", team: "Team", growth: "Growth" };

// Only shown to ADMIN_OF (billing is their concern per spec §2) and only
// while status is "trialing" — flips to null once a real payment
// processor is wired in and a webhook moves the subscription to "active"
// (see Subscription in schema.prisma and the /integrations page).
function TrialBanner({ plan, trialEndsAt }: { plan: string; trialEndsAt: Date }) {
  const daysLeft = Math.max(0, differenceInCalendarDays(trialEndsAt, new Date()));
  return (
    <div className="bg-[#F7EFDB] border border-[#EBDCB4] rounded-card px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-[12.5px] text-seal-dark">
        Essai <strong>{PLAN_LABELS[plan] ?? plan}</strong> — {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}` : "se termine aujourd'hui"}, sans carte bancaire.
      </div>
      <Link href="/integrations" className="text-[12px] font-medium text-seal-dark underline decoration-[#EBDCB4] hover:decoration-seal-dark shrink-0">
        Gérer la facturation
      </Link>
    </div>
  );
}
