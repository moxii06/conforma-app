import { prisma } from "@/lib/prisma";
import { MetricCard, PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canAccessSecureReports } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { BarChart } from "@/components/charts/BarChart";
import { getDashboardTasks, type DashboardTask } from "@/lib/dashboardTasks";
import { getCourseCompletion } from "@/lib/lms";
import { PipelineStage, Role } from "@prisma/client";
import { addWeeks, startOfWeek, format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { RefreshButton } from "@/components/RefreshButton";

const TASK_KIND_LABELS: Record<DashboardTask["kind"], string> = {
  needs_assessment: "Test de positionnement",
  contract: "Contrat",
  platform_access: "Accès plateforme",
  convocation: "Convocation",
  invoice_overdue: "Facture",
  rgpd_suggestion: "RGPD (IA)",
  rgpd_deadline: "RGPD",
  session_draft: "Session",
  subcontractor_expiry: "Sous-traitant",
  dossier_prep_needs_assessment: "Recueil des besoins",
  dossier_prep_contract: "Convention",
  rolling_deadline_warning: "Formation en continu",
  rolling_deadline_overdue: "Formation en continu",
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  PROSPECT: "Prospect",
  QUOTE_SENT: "Devis",
  CONTRACT_SIGNED: "Signée",
  SESSION_SCHEDULED: "Planifiée",
  TO_INVOICE: "À facturer",
  INVOICED: "Facturé",
  PAID: "Payé",
};

export default async function DashboardPage() {
  const { organizationId, role, userId } = await requireSessionContext();
  // /dashboard shows org-wide CRM pipeline and cross-learner progress
  // data — it was never gated like every other page, and being the
  // hardcoded post-login landing page meant LEARNER/DPO_EXTERNAL accounts
  // saw it directly. Redirect to each role's real home instead.
  if (can(role, "dashboard") === "none") redirect(role === "LEARNER" ? "/mon-espace" : "/rgpd");

  const subscription =
    role === Role.ADMIN_OF
      ? await prisma.subscription.findUnique({ where: { organizationId } })
      : null;

  const tasks = await getDashboardTasks(organizationId, role, userId);

  // Same visibility rules as /support — a complaint/report otherwise only
  // surfaced there, easy to miss unless someone thinks to go check. Split
  // into two widgets rather than folded into "À faire": different audiences
  // (complaints: anyone with dossier access; signalements: ADMIN_OF only,
  // deliberately narrower) and conflating them risked burying the
  // confidential channel among routine relances.
  const canManageComplaints = can(role, "dossiers") !== "none";
  const canViewSecureReports = canAccessSecureReports(role);

  const [
    sessionsInProgress,
    openNonConformities,
    opportunitiesByStage,
    amountsByStage,
    overdueInvoiceTotal,
    upcomingSessions,
    elearningDossiers,
    openComplaints,
    openSecureReports,
  ] = await Promise.all([
    prisma.session.count({
      // ROLLING (bande passante) sessions have no real start/end — their
      // placeholder dates would otherwise make them count as permanently
      // "in progress" here.
      where: { organizationId, mode: "FIXED_DATE", startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    }),
    prisma.nonConformity.count({ where: { organizationId, status: { not: "resolved" } } }),
    prisma.opportunity.groupBy({ by: ["stage"], where: { organizationId }, _count: true }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      where: { organizationId, stage: { in: ["TO_INVOICE", "INVOICED", "PAID"] } },
      _sum: { amountCents: true },
    }),
    prisma.invoice.aggregate({ where: { organizationId, status: "OVERDUE" }, _sum: { amountCents: true }, _count: true }),
    prisma.session.findMany({
      where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: new Date(), lte: addWeeks(new Date(), 6) } },
      select: { startsAt: true },
    }),
    // Only dossiers whose course actually has e-learning content — a
    // dossier for a purely in-person course has nothing to be "not
    // started" on, so counting it there would just inflate that bucket.
    prisma.dossier.findMany({
      where: { organizationId, session: { course: { elearningModules: { some: {} } } } },
      select: {
        id: true,
        elearningProgress: { select: { moduleId: true, percentComplete: true } },
        quizAttempts: { select: { quizId: true, passed: true } },
        session: { select: { course: { select: { elearningModules: { select: { id: true, type: true, quiz: { select: { id: true } } } } } } } },
      },
    }),
    canManageComplaints
      ? prisma.complaint.findMany({ where: { organizationId, status: { not: "resolved" } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    canViewSecureReports
      ? prisma.secureReport.findMany({ where: { organizationId, status: { not: "closed" } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  const stageCounts = new Map(opportunitiesByStage.map((g) => [g.stage, g._count]));
  const stageAmounts = new Map(amountsByStage.map((g) => [g.stage, g._sum.amountCents ?? 0]));
  const formatAmount = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
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

  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;
  for (const d of elearningDossiers) {
    const { completedCount, allCompleted } = getCourseCompletion(
      d.session.course.elearningModules,
      d.elearningProgress,
      d.quizAttempts
    );
    if (allCompleted) completed++;
    else if (completedCount > 0 || d.elearningProgress.some((p) => p.percentComplete > 0)) inProgress++;
    else notStarted++;
  }
  const elearningData = [
    { label: "Pas commencé", value: notStarted },
    { label: "En cours", value: inProgress },
    { label: "Terminé", value: completed },
  ];

  const canSeeMoney = role === Role.ADMIN_OF || role === Role.ADMIN_MANAGER;

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble" />
      <div className="p-8 flex flex-col gap-5">
        {subscription?.status === "trialing" && subscription.trialEndsAt && (
          <TrialBanner plan={subscription.plan} trialEndsAt={subscription.trialEndsAt} />
        )}

        {tasks.length > 0 && <TasksWidget tasks={tasks} />}

        {canManageComplaints && openComplaints.length > 0 && <ComplaintsWidget complaints={openComplaints} />}
        {canViewSecureReports && openSecureReports.length > 0 && <SecureReportsWidget reports={openSecureReports} />}

        {canSeeMoney && (
          <div className="flex flex-col gap-2">
            <div className="text-[12px] font-semibold text-slate uppercase tracking-wide px-0.5">Argent</div>
            <div className="flex gap-3.5">
              <MetricCard label="À facturer" value={formatAmount(stageAmounts.get("TO_INVOICE") ?? 0)} />
              <MetricCard label="Facturé, en attente de paiement" value={formatAmount(stageAmounts.get("INVOICED") ?? 0)} />
              <MetricCard label="Payé" value={formatAmount(stageAmounts.get("PAID") ?? 0)} />
              <MetricCard
                label="Factures en retard"
                value={formatAmount(overdueInvoiceTotal._sum.amountCents ?? 0)}
                hint={overdueInvoiceTotal._count > 0 ? `${overdueInvoiceTotal._count} facture${overdueInvoiceTotal._count > 1 ? "s" : ""}` : undefined}
                tone={overdueInvoiceTotal._count > 0 ? "danger" : "ink"}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3.5">
          <MetricCard label="Sessions en cours" value={String(sessionsInProgress)} />
          <MetricCard label="Non-conformités ouvertes" value={String(openNonConformities)} />
        </div>

        <div className="flex gap-3.5">
          <div className="bg-white border border-line rounded-card p-4 flex-1">
            <div className="text-[12.5px] text-slate mb-3">Pipeline commercial par étape</div>
            <BarChart data={pipelineData} color="#8C6B2E" />
          </div>
          <div className="bg-white border border-line rounded-card p-4 flex-1">
            <div className="text-[12.5px] text-slate mb-3">Sessions programmées (6 prochaines semaines)</div>
            <BarChart data={weekBuckets.map((w) => ({ label: w.label, value: w.value }))} color="#4B6358" />
          </div>
        </div>

        {elearningDossiers.length > 0 && (
          <div className="bg-white border border-line rounded-card p-4">
            <div className="text-[12.5px] text-slate mb-3">
              Progression e-learning ({elearningDossiers.length} inscription{elearningDossiers.length > 1 ? "s" : ""} sur une formation avec contenu en ligne)
            </div>
            <BarChart data={elearningData} color="#1B2430" />
          </div>
        )}
      </div>
    </>
  );
}

function TasksWidget({ tasks }: { tasks: DashboardTask[] }) {
  const overdueCount = tasks.filter((t) => t.overdue).length;
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[12.5px] text-slate">À faire ({tasks.length})</div>
        {overdueCount > 0 && <Pill tone="danger">{overdueCount} en retard</Pill>}
        <div className="flex-1" />
        <RefreshButton />
      </div>
      <div className="flex flex-col">
        {tasks.slice(0, 8).map((t) => (
          <Link
            key={`${t.kind}-${t.id}`}
            href={t.href}
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-[#EFEDE7] -mx-1 px-1 rounded"
          >
            <div>
              <span className="text-[12.5px] text-ink font-medium">{t.contactName}</span>
              <span className="text-[12.5px] text-slate"> — {t.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.overdue && <Pill tone="danger">En retard</Pill>}
              <span className="text-[11px] text-slate">{TASK_KIND_LABELS[t.kind]}</span>
            </div>
          </Link>
        ))}
      </div>
      {tasks.length > 8 && (
        <div className="text-[11.5px] text-slate mt-2 pt-2 border-t border-line">
          + {tasks.length - 8} autre{tasks.length - 8 > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function ComplaintsWidget({
  complaints,
}: {
  complaints: { id: string; subject: string; submittedByName: string; createdAt: Date; status: string }[];
}) {
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[12.5px] text-slate">Réclamations en attente ({complaints.length})</div>
      </div>
      <div className="flex flex-col">
        {complaints.slice(0, 5).map((c) => (
          <Link
            key={c.id}
            href="/support"
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-[#EFEDE7] -mx-1 px-1 rounded"
          >
            <div className="min-w-0">
              <span className="text-[12.5px] text-ink font-medium truncate">{c.subject}</span>
              <span className="text-[12.5px] text-slate"> — {c.submittedByName}</span>
            </div>
            <span className="text-[11px] text-slate shrink-0">{format(c.createdAt, "d MMM", { locale: fr })}</span>
          </Link>
        ))}
      </div>
      {complaints.length > 5 && (
        <div className="text-[11.5px] text-slate mt-2 pt-2 border-t border-line">
          + {complaints.length - 5} autre{complaints.length - 5 > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ADMIN_OF-only (canAccessSecureReports) — kept as its own widget rather
// than merged with ComplaintsWidget so the confidential-reporting channel
// never ends up on a screen a broader audience (SALES/TRAINER, who can see
// ComplaintsWidget) might glimpse.
function SecureReportsWidget({
  reports,
}: {
  reports: { id: string; description: string; reporterName: string | null; createdAt: Date; status: string }[];
}) {
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[12.5px] text-slate">Signalements confidentiels ({reports.length})</div>
        <Pill tone="danger">Accès restreint</Pill>
      </div>
      <div className="flex flex-col">
        {reports.slice(0, 5).map((r) => (
          <Link
            key={r.id}
            href="/support"
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-[#EFEDE7] -mx-1 px-1 rounded"
          >
            <div className="min-w-0">
              <span className="text-[12.5px] text-ink font-medium truncate">{r.description.slice(0, 60)}{r.description.length > 60 ? "…" : ""}</span>
              <span className="text-[12.5px] text-slate"> — {r.reporterName ?? "Anonyme"}</span>
            </div>
            <span className="text-[11px] text-slate shrink-0">{format(r.createdAt, "d MMM", { locale: fr })}</span>
          </Link>
        ))}
      </div>
      {reports.length > 5 && (
        <div className="text-[11.5px] text-slate mt-2 pt-2 border-t border-line">
          + {reports.length - 5} autre{reports.length - 5 > 1 ? "s" : ""}
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
    <div className="bg-[#F0E7D4] border border-[#D9C79E] rounded-card px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-[12.5px] text-seal-dark">
        Essai <strong>{PLAN_LABELS[plan] ?? plan}</strong> — {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}` : "se termine aujourd'hui"}, sans carte bancaire.
      </div>
      <Link href="/abonnement" className="text-[12px] font-medium text-seal-dark underline decoration-[#D9C79E] hover:decoration-seal-dark shrink-0">
        Gérer la facturation
      </Link>
    </div>
  );
}
