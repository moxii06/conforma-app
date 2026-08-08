import { prisma } from "@/lib/prisma";
import { MetricCard, PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can, canAccessSecureReports } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { BarChart } from "@/components/charts/BarChart";
import { AreaChart } from "@/components/charts/AreaChart";
import { getDashboardTasks, type DashboardTask } from "@/lib/dashboardTasks";
import { TASK_THEMES, themeOf, themeDemande, libelleTheme, type ThemeKey } from "@/lib/dashboardTaskThemes";
import { groupTasksByKind, type TaskGroup } from "@/lib/dashboardTaskGroups";
import { TASK_ACTIONS } from "@/lib/dashboardTaskActions";
import { BulkTaskActionDialog } from "@/components/BulkTaskActionDialog";
import { DismissBeforeDialog } from "@/components/DismissBeforeDialog";
import { Role } from "@prisma/client";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/pipelineStages";
import { addWeeks, addMonths, startOfWeek, startOfMonth, subMonths, format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";
import { RefreshButton } from "@/components/RefreshButton";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { getOnboardingSteps, nextStep, type OnboardingStep } from "@/lib/onboarding";
import { CheckCircle2, Circle, HelpCircle } from "lucide-react";
import { DismissTaskButton } from "@/components/DismissTaskButton";
import { DashboardTaskAction } from "@/components/DashboardTaskAction";
import { ShowMoreToggle } from "@/components/ShowMoreToggle";
import { DashboardWidgetGrid } from "@/components/DashboardWidgetGrid";

const TASK_KIND_LABELS: Record<DashboardTask["kind"], string> = {
  needs_assessment: "Test de positionnement",
  contract: "Contrat",
  platform_access: "Accès plateforme",
  platform_access_after_payment: "Accès plateforme",
  convocation: "Convocation",
  invoice_overdue: "Facture",
  mediator_missing: "Médiation",
  rgpd_suggestion: "RGPD (IA)",
  rgpd_deadline: "RGPD",
  session_draft: "Session",
  subcontractor_expiry: "Sous-traitant",
  subcontractor_renewal_notice: "Reconduction tacite",
  dossier_prep_needs_assessment: "Recueil des besoins",
  dossier_prep_contract: "Convention",
  rolling_deadline_warning: "Formation en continu",
  rolling_deadline_overdue: "Formation en continu",
  satisfaction_not_collected: "Satisfaction",
  learner_inactive: "Décrochage",
  certificate_to_send: "Attestation",
  bank_transaction_pending: "Rapprochement bancaire",
  funding_no_reply: "Financeur",
  funding_agreement_expiring: "Financeur",
  qualiopi_certificate_expiring: "Certificat Qualiopi",
  qualiopi_audit_upcoming: "Audit Qualiopi",
  qualiopi_finding_open: "Non-conformité",
  intervenant_evaluation_due: "Évaluation intervenant",
  session_uninvoiced: "À facturer",
  email_assigned: "Email assigné",
  rgpd_request_assigned: "Demande RGPD",
  support_request_assigned: "Demande d'aide",
};

// Les piles vivent dans lib/dashboardTaskThemes.ts : le filtre en a besoin,
// et c'est désormais cette table qui définit le vocabulaire des tâches.

// Defensive re-parse of User.dashboardLayout (Json?) — validated by the
// route that wrote it, but a Json column proves nothing at read time. A
// malformed entry drops silently — DashboardWidgetGrid's own merge falls
// back to "append full width" for anything it can't place, so this only
// ever costs the user their saved arrangement, never a missing widget.
function parseDashboardLayout(raw: unknown): { id: string; span: 1 | 2 }[] | null {
  if (!Array.isArray(raw)) return null;
  const entries = raw.filter(
    (e): e is { id: string; span: 1 | 2 } =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).id === "string" &&
      ((e as Record<string, unknown>).span === 1 || (e as Record<string, unknown>).span === 2),
  );
  return entries.length > 0 ? entries : null;
}

export default async function DashboardPage(props: { searchParams: Promise<{ pile?: string }> }) {
  const { pile } = await props.searchParams;
  const { organizationId, role, roles, userId } = await requireSessionContext();
  // /dashboard shows org-wide CRM pipeline and cross-learner progress
  // data — it was never gated like every other page, and being the
  // hardcoded post-login landing page meant LEARNER/DPO_EXTERNAL accounts
  // saw it directly. Redirect to each role's real home instead.
  if (can(roles, "dashboard") === "none") redirect(role === "LEARNER" ? "/mon-espace" : "/rgpd");

  // Le parcours de démarrage ne concerne que le rôle qui peut réellement le
  // franchir : chaque étape mène à un écran réservé à l'administrateur de
  // l'organisme. L'afficher à un commercial serait une liste d'actions
  // impossibles.
  const onboarding = role === Role.ADMIN_OF ? await getOnboardingSteps(organizationId) : [];
  const onboardingRemaining = onboarding.filter((s) => !s.done).length;

  const subscription =
    role === Role.ADMIN_OF
      ? await prisma.subscription.findUnique({ where: { organizationId } })
      : null;

  // Les rôles EFFECTIFS en 4e argument : c'est ce qui fait qu'un
  // formateur-commercial reçoit les deux jeux de tâches. `role` reste passé
  // en 3e — il porte encore les filtres de propriété (voir dashboardTasks).
  const { tasks, tronquee: tachesTronquees } = await getDashboardTasks(organizationId, role, userId, roles);
  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { dashboardLayout: true } });
  // Date de reprise du « à faire », si l'organisme en a choisi une.
  const orgReprise = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { tasksHiddenBefore: true },
  });
  const repriseActuelleIso = orgReprise.tasksHiddenBefore?.toISOString() ?? null;
  const savedLayout = parseDashboardLayout(currentUser.dashboardLayout);

  // Same visibility rules as /support — a complaint/report otherwise only
  // surfaced there, easy to miss unless someone thinks to go check. Split
  // into two widgets rather than folded into "À faire": different audiences
  // (complaints: anyone with dossier access; signalements: ADMIN_OF only,
  // deliberately narrower) and conflating them risked burying the
  // confidential channel among routine relances.
  const canManageComplaints = can(roles, "dossiers") !== "none";
  const canViewSecureReports = canAccessSecureReports(roles);
  // Le bloc « Argent » (montants facturés, encaissements, factures en retard)
  // s'écrivait `role === ADMIN_OF || role === ADMIN_MANAGER` : un contrôle de
  // PERMISSION déguisé en comparaison de rôles, avec deux conséquences. Un
  // commercial à qui on ajoutait la casquette responsable administratif ne
  // voyait toujours pas les montants, alors que /facturation, elle, s'ouvrait
  // à lui. Et la politique vivait ici plutôt que dans la matrice.
  //
  // `invoicing` rend EXACTEMENT les mêmes deux rôles (ADMIN_OF « full »,
  // ADMIN_MANAGER « limited », tous les autres « none ») : aucune nouvelle
  // clé à créer, aucun élargissement, et c'est déjà la clé que la fiche
  // dossier interroge pour son bloc Financement — l'argent a un seul public.
  const canSeeMoney = can(roles, "invoicing") !== "none";
  // Lus dans la matrice plutôt que par comparaison de rôle : un rôle ajouté
  // plus tard hérite alors de la bonne visibilité sans qu'on ait à revenir
  // ici (CLAUDE.md — la matrice reste le seul endroit où l'accès se décide).
  const canSeeCrm = can(roles, "crm") !== "none";
  const canSeeQualiopi = can(roles, "qualiopi") !== "none";

  const [
    sessionsInProgress,
    openNonConformities,
    opportunitiesByStage,
    awaitingInvoiceTotal,
    paidInvoiceTotal,
    overdueInvoiceTotal,
    upcomingSessions,
    recentPayments,
    openComplaints,
    openSecureReports,
  ] = await Promise.all([
    prisma.session.count({
      // ROLLING (bande passante) sessions have no real start/end — their
      // placeholder dates would otherwise make them count as permanently
      // "in progress" here.
      where: { organizationId, mode: "FIXED_DATE", startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    }),
    // NonConformity n'est jamais écrit par aucun écran (seul le jeu de démo
    // le remplit) — les vraies non-conformités viennent des constats
    // d'audit (QualiopiAuditFinding, onglet Audits), "ouverte" étant le
    // seul statut qui alerte (même règle que la tâche qualiopi_finding_open
    // de dashboardTasks.ts ; "levée" est un repos normal jusqu'au prochain
    // audit).
    prisma.qualiopiAuditFinding.count({ where: { audit: { organizationId }, status: "ouverte" } }),
    prisma.opportunity.groupBy({ by: ["stage"], where: { organizationId }, _count: true }),
    // Audit P1 : les montants de la section « Argent » venaient des étapes
    // financières du pipeline CRM — le doublon que le client a signalé. Ils
    // viennent maintenant des factures elles-mêmes, comme sur l'écran
    // Facturation, avec le même découpage : en attente ≠ en retard, jamais
    // la même facture comptée deux fois.
    prisma.invoice.aggregate({
      where: { organizationId, status: "SENT", OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] },
      _sum: { amountCents: true },
    }),
    prisma.invoice.aggregate({ where: { organizationId, status: "PAID" }, _sum: { amountCents: true } }),
    // Same auto-detection as dashboardTasks.ts's invoice_overdue task
    // (dueDate passed, not PAID/DRAFT) — this card would otherwise keep
    // showing a stale, artificially low total for any invoice staff hasn't
    // manually flipped to OVERDUE yet.
    prisma.invoice.aggregate({
      where: { organizationId, status: { notIn: ["PAID", "DRAFT"] }, OR: [{ status: "OVERDUE" }, { dueDate: { lt: new Date() } }] },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.session.findMany({
      where: { organizationId, mode: "FIXED_DATE", startsAt: { gte: new Date(), lte: addWeeks(new Date(), 6) } },
      select: { startsAt: true },
    }),
    canSeeMoney
      ? prisma.payment.findMany({
          where: { organizationId, paidAt: { gte: startOfMonth(subMonths(new Date(), 5)) } },
          select: { amountCents: true, paidAt: true },
        })
      : Promise.resolve([]),
    canManageComplaints
      ? prisma.complaint.findMany({ where: { organizationId, status: { not: "resolved" } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    canViewSecureReports
      ? prisma.secureReport.findMany({ where: { organizationId, status: { not: "closed" } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  const stageCounts = new Map(opportunitiesByStage.map((g) => [g.stage, g._count]));
  const formatAmount = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  // STAGE_ORDER, pas Object.values(PipelineStage) : l'ordre déclaré dans
  // l'enum n'a pas à porter la sémantique d'affichage.
  const pipelineData = STAGE_ORDER.map((stage) => ({
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

  const monthBuckets = Array.from({ length: 6 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(new Date(), 5 - i));
    return { monthStart, label: format(monthStart, "MMM yyyy", { locale: fr }), value: 0 };
  });
  for (const p of recentPayments) {
    const bucket = monthBuckets.find((m, i) => {
      const next = i + 1 < monthBuckets.length ? monthBuckets[i + 1].monthStart : addMonths(m.monthStart, 1);
      return p.paidAt >= m.monthStart && p.paidAt < next;
    });
    if (bucket) bucket.value += p.amountCents / 100;
  }

  // The four "banner" widgets (self-contained cards a user might want to
  // reorder or shrink to half-width) go through DashboardWidgetGrid below —
  // unlike the Argent/Activité/Pilotage sections further down, which are
  // metric-grid/chart rows, not standalone cards, and stay in their fixed
  // order. Built as a list rather than left inline so the grid can place
  // them by the user's saved order without this component knowing that
  // order itself.
  const bannerWidgets = [
    onboardingRemaining > 0
      ? { id: "onboarding", node: <OnboardingWidget steps={onboarding} remaining={onboardingRemaining} /> }
      : null,
    tasks.length > 0
      ? {
          id: "tasks",
          node: (
            <TasksWidget
              tasks={tasks}
              tronquee={tachesTronquees}
              repriseActuelleIso={repriseActuelleIso}
              pile={themeDemande(pile)}
            />
          ),
        }
      : null,
    canManageComplaints && openComplaints.length > 0
      ? { id: "complaints", node: <ComplaintsWidget complaints={openComplaints} /> }
      : null,
    canViewSecureReports && openSecureReports.length > 0
      ? { id: "secure-reports", node: <SecureReportsWidget reports={openSecureReports} /> }
      : null,
  ].filter((w): w is { id: string; node: JSX.Element } => w !== null);

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`Vue d'ensemble · ${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}`} />
      <div className="p-8 flex flex-col gap-5">
        {subscription?.status === "trialing" && subscription.trialEndsAt && (
          <TrialBanner plan={subscription.plan} trialEndsAt={subscription.trialEndsAt} />
        )}

        {/* Prise en main, À faire, Réclamations, Signalements confidentiels —
            reorderable/resizable by the user (see DashboardWidgetGrid). Which
            of these even appear is still decided entirely above, server-side
            (role, permissions, whether there's anything to show) — the grid
            only ever arranges what this specific request already resolved
            to render for this user; it never learns about a widget the
            server chose to leave out. */}
        {bannerWidgets.length > 0 && <DashboardWidgetGrid items={bannerWidgets} initialLayout={savedLayout} />}

        {canSeeMoney && (
          <div className="flex flex-col gap-2">
            <div className="text-[12px] font-semibold text-slate uppercase tracking-wide px-0.5">Argent</div>
            <div className="flex gap-3.5">
              <MetricCard
                label="En attente de paiement"
                value={formatAmount(awaitingInvoiceTotal._sum.amountCents ?? 0)}
                href="/facturation?tab=factures&status=SENT"
              />
              <MetricCard label="Encaissé" value={formatAmount(paidInvoiceTotal._sum.amountCents ?? 0)} tone="good" href="/facturation?tab=factures&status=PAID" />
              <MetricCard
                label="Factures en retard"
                value={formatAmount(overdueInvoiceTotal._sum.amountCents ?? 0)}
                hint={overdueInvoiceTotal._count > 0 ? `${overdueInvoiceTotal._count} facture${overdueInvoiceTotal._count > 1 ? "s" : ""}` : undefined}
                tone={overdueInvoiceTotal._count > 0 ? "danger" : "ink"}
                href="/facturation?tab=factures&status=OVERDUE"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold text-slate uppercase tracking-wide px-0.5">Activité</div>
          <div className="flex gap-3.5">
            <MetricCard label="Sessions en cours" value={sessionsInProgress} href="/planning" />
            {/* Le compteur de non-conformités pointait vers /qualiopi et
                s'affichait pour tout le monde — dont les formateurs externes,
                à qui l'état de conformité de l'organisme ne regarde pas. */}
            {canSeeQualiopi && (
              <MetricCard
                label="Non-conformités ouvertes"
                value={openNonConformities}
                tone={openNonConformities > 0 ? "danger" : "ink"}
                href="/qualiopi"
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold text-slate uppercase tracking-wide px-0.5">Pilotage</div>
          <div className="flex gap-3.5">
            {/* Le pipeline commercial complet était affiché sans aucune
                condition : un formateur externe connecté voyait le carnet de
                commandes de l'organisme, étape par étape. */}
            {canSeeCrm && (
              <div className="bg-white border border-line rounded-card p-4 flex-1">
                <div className="text-[12.5px] text-slate mb-3">Pipeline commercial par étape</div>
                <BarChart data={pipelineData} color="#8C6B2E" />
              </div>
            )}
            <div className="bg-white border border-line rounded-card p-4 flex-1">
              <div className="text-[12.5px] text-slate mb-3">Sessions programmées (6 prochaines semaines)</div>
              {/* Courbe (pas barres) : série temporelle — style validé à l'audit P1. */}
              <AreaChart data={weekBuckets.map((w) => ({ label: w.label, value: w.value }))} color="#4B6358" />
            </div>
          </div>
        </div>

        {canSeeMoney && (
          <div className="bg-white border border-line rounded-card p-4 max-w-md">
            <div className="text-[12.5px] text-slate mb-3">Paiements encaissés par mois (6 derniers mois)</div>
            <AreaChart
              data={monthBuckets.map((m) => ({ label: m.label, value: m.value }))}
              color="#8C6B2E"
              formatValue={(v) => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            />
          </div>
        )}
      </div>
    </>
  );
}

// One row, defined once. It used to be copy-pasted verbatim between the
// first-8 list and the "voir plus" list, so any change to a task row had to
// be made twice or the two halves would drift.
function TaskRow({ task }: { task: DashboardTask }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded">
      <Link href={task.href} className="min-w-0 flex-1">
        <span className="text-[12.5px] text-ink font-medium">{task.contactName}</span>
        <span className="text-[12.5px] text-slate"> — {task.label}</span>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {/* L'échéance, quand il y en a une. Aucune date n'était affichée :
            « Convocation à envoyer » se lisait pareil que la session soit
            demain ou dans six jours, alors que c'est toute la différence. */}
        {!task.overdue && task.dueAt && <span className="text-[11px] text-rust">{echeanceLabel(task.dueAt)}</span>}
        {task.overdue && <Pill tone="danger">En retard</Pill>}
        {/* Ne rend rien pour les kinds sans action en un clic — la liste des
            kinds concernés vit dans le composant client, pas ici : la tester
            depuis le serveur reviendrait à appeler une fonction client. */}
        <DashboardTaskAction kind={task.kind} id={task.id} contactName={task.contactName} />
        <span className="text-[11px] text-slate">{TASK_KIND_LABELS[task.kind]}</span>
        <DismissTaskButton kind={task.kind} id={task.id} />
      </div>
    </div>
  );
}

/**
 * Une famille entière en une ligne, quand l'énumérer n'apprendrait rien.
 *
 * Le contraste avec TaskRow est volontaire : pas de nom, pas de date, pas
 * de bouton d'action individuel — ces informations ne veulent rien dire
 * pour quarante dossiers à la fois. Ce qui reste, c'est le nombre, le
 * retard éventuel, et l'endroit où traiter le lot.
 */
function TaskSummaryRow({ famille }: { famille: TaskGroup }) {
  const n = famille.items.length;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded">
      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] text-ink font-medium">
          {n.toLocaleString("fr-FR")} {famille.libelle}
        </span>
        {famille.overdue > 0 && <Pill tone="danger">{famille.overdue.toLocaleString("fr-FR")} en retard</Pill>}
      </div>
      {/* L'action de masse ne s'affiche que pour les familles dont l'action
          tient en un appel (voir dashboardTaskActions.ts). Elle précède le
          lien : traiter le lot est l'intention principale, aller voir la
          liste est le repli. */}
      {TASK_ACTIONS[famille.kind] && (
        <BulkTaskActionDialog
          kind={famille.kind}
          libelle={famille.libelle}
          cibles={famille.items.map((t) => ({ id: t.id, contactName: t.contactName }))}
        />
      )}
      {famille.href ? (
        <Link
          href={famille.href}
          className="text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink shrink-0"
        >
          Voir la liste →
        </Link>
      ) : (
        // Aucun écran filtré ne couvre cette famille : on déplie sur place
        // plutôt que d'envoyer vers une page non filtrée où il faudrait
        // retrouver les lignes à la main.
        <div className="shrink-0">
          <ShowMoreToggle count={n}>
            <div className="flex flex-col">
              {famille.items.map((t) => (
                <TaskRow key={`${t.kind}-${t.id}`} task={t} />
              ))}
            </div>
          </ShowMoreToggle>
        </div>
      )}
    </div>
  );
}

/** « aujourd'hui », « demain », « dans 5 j », puis la date au-delà d'une semaine. */
function echeanceLabel(dueAt: Date): string {
  const jours = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  if (jours <= 7) return `dans ${jours} j`;
  return format(dueAt, "d MMM", { locale: fr });
}

/**
 * Le parcours de démarrage, confronté à l'état réel de l'organisation.
 *
 * Une seule étape est développée — la prochaine à faire. Les six d'un coup,
 * c'est la liste de courses qui décourage ; une seule, c'est une action.
 * Les étapes franchies restent visibles, barrées : voir ce qu'on a déjà fait
 * est la moitié de ce qui donne envie de continuer.
 */
function OnboardingWidget({ steps, remaining }: { steps: OnboardingStep[]; remaining: number }) {
  const next = nextStep(steps);
  const doneCount = steps.length - remaining;

  return (
    <div className="bg-white border border-line rounded-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="text-[13.5px] font-semibold text-ink">Prise en main</div>
        <div className="text-[12px] text-slate tabular-nums">
          {doneCount}/{steps.length} étapes
        </div>
      </div>
      <div className="h-1.5 bg-pebble rounded-full overflow-hidden mb-3.5">
        <div className="h-full bg-sage" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
      </div>
      <div className="flex flex-col">
        {steps.map((step) => {
          const isNext = step === next;
          return (
            <div key={step.title} className="flex items-start gap-2.5 py-2 border-t border-line first:border-t-0">
              {step.done ? (
                <CheckCircle2 size={15} className="text-sage mt-0.5 shrink-0" />
              ) : (
                <Circle size={15} className={`mt-0.5 shrink-0 ${isNext ? "text-ink" : "text-ash"}`} />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[12.5px] ${
                    step.done ? "text-slate line-through decoration-line" : isNext ? "text-ink font-semibold" : "text-ink"
                  }`}
                >
                  {step.title}
                </div>
                {isNext && (
                  <>
                    <div className="text-[11.5px] text-slate leading-relaxed mt-1">{step.detail}</div>
                    <Link
                      href={step.href}
                      className="inline-block text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink mt-1.5"
                    >
                      Y aller
                    </Link>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-slate mt-3 pt-3 border-t border-line">
        Coché automatiquement d&apos;après ce que contient votre compte — rien à valider à la main. Le détail de
        chaque étape reste dans{" "}
        <Link href="/faq" className="underline decoration-line hover:decoration-ink">
          FAQ &amp; guides
        </Link>
        .
      </div>
    </div>
  );
}

// `tronquee` : le calcul plafonne chaque famille de tâches (voir
// dashboardTasks.ts). Sans ce drapeau, le titre annoncerait un total qui
// n'en est pas un — c'est précisément le défaut relevé par l'audit sur le
// journal des automatisations, il ne faut pas le reproduire ici.
function TasksWidget({
  tasks,
  tronquee,
  repriseActuelleIso,
  pile,
}: {
  tasks: DashboardTask[];
  tronquee: boolean;
  repriseActuelleIso: string | null;
  /** La pile isolée, ou null pour tout voir. */
  pile: ThemeKey | null;
}) {
  // Les piles se comptent sur la LISTE ENTIÈRE, jamais sur ce qui reste
  // après filtrage : sinon isoler « Argent » ferait tomber les trois autres
  // compteurs à zéro et il n'y aurait plus de chemin de retour lisible.
  const parPile = TASK_THEMES.map((theme) => ({
    ...theme,
    items: tasks.filter((t) => themeOf(t.kind) === theme.key),
  })).filter((g) => g.items.length > 0);

  const affichees = pile ? tasks.filter((t) => themeOf(t.kind) === pile) : tasks;
  const overdueCount = affichees.filter((t) => t.overdue).length;

  // Grouped by theme, but only once there are enough tasks for the grouping
  // to earn its headers — with four items, section titles are more chrome
  // than signal. Within a theme the incoming order is preserved, so overdue
  // still comes first and oldest-first inside that.
  //
  // Une pile isolée n'a plus d'intertitre à porter : le filtre au-dessus dit
  // déjà laquelle on regarde, le répéter en tête de liste ne dirait rien.
  const grouped = pile ? [] : parPile;
  const useGroups = !pile && affichees.length > 6 && grouped.length > 1;

  return (
    <CollapsibleSection
      title={
        pile
          ? `À faire — ${libelleTheme(pile)} (${affichees.length})`
          : `À faire (${tasks.length}${tronquee ? "+" : ""})`
      }
      badge={overdueCount > 0 ? <Pill tone="danger">{overdueCount} en retard</Pill> : undefined}
      extra={
        <div className="flex items-center gap-3">
          {/* Après une reprise d'historique, la liste est pleine de dossiers
              clos qui ne sont du travail pour personne. Une date, un clic. */}
          <DismissBeforeDialog repriseActuelleIso={repriseActuelleIso} />
          <RefreshButton />
        </div>
      }
      // Le filtre reste visible replié : le widget démarre fermé, et un
      // filtre caché dans un corps fermé ne sert à rien. Choisir une pile
      // ouvre la liste — on vient de demander à la voir.
      header={
        parPile.length > 1 ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <PilleFiltre href="/dashboard" label="Tout" count={tasks.length} actif={pile === null} />
            {parPile.map((g) => (
              <PilleFiltre
                key={g.key}
                href={`/dashboard?pile=${g.key}`}
                label={g.label}
                count={g.items.length}
                actif={pile === g.key}
                alerte={g.items.filter((t) => t.overdue).length}
              />
            ))}
          </div>
        ) : undefined
      }
      defaultOpen={pile !== null}
    >
      {useGroups ? (
        <div className="flex flex-col gap-3.5">
          {grouped.map((group) => {
            const groupOverdue = group.items.filter((t) => t.overdue).length;
            return (
              <div key={group.key}>
                <div className="flex items-center gap-2 pb-1">
                  <span className="text-[11px] font-semibold text-slate uppercase tracking-wide">{group.label}</span>
                  <span className="text-[11px] text-slate">({group.items.length})</span>
                  {groupOverdue > 0 && <Pill tone="danger">{groupOverdue} en retard</Pill>}
                </div>
                <div className="flex flex-col">
                  {/* Dans un thème, chaque FAMILLE de tâches est soit
                      résumée en une ligne (quand elles se comptent par
                      dizaines et disent toutes la même chose), soit listée
                      nominativement (quand il y en a peu, et que le nom de
                      l'apprenant est justement l'information utile). */}
                  {groupTasksByKind(group.items).map((famille) =>
                    famille.resume ? (
                      <TaskSummaryRow key={famille.kind} famille={famille} />
                    ) : (
                      famille.items.map((t) => <TaskRow key={`${t.kind}-${t.id}`} task={t} />)
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Même dans une pile isolée, les familles nombreuses se résument
              en une ligne : c'est la règle du widget, pas celle des
              intertitres, et vingt factures en retard n'ont pas à être lues
              une par une pour être relancées ensemble. */}
          {groupTasksByKind(affichees).map((famille) =>
            famille.resume ? (
              <TaskSummaryRow key={famille.kind} famille={famille} />
            ) : (
              famille.items.map((t) => <TaskRow key={`${t.kind}-${t.id}`} task={t} />)
            ),
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

/** Une pastille de filtre : un lien, son compte, et son retard s'il y en a. */
function PilleFiltre({
  href,
  label,
  count,
  actif,
  alerte = 0,
}: {
  href: string;
  label: string;
  count: number;
  actif: boolean;
  alerte?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "true" : undefined}
      className={`flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors ${
        actif ? "bg-ink text-white border-ink" : "bg-white text-slate border-line hover:text-ink hover:border-ash"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className={actif ? "text-white/70" : "text-ash"}>{count}</span>
      {alerte > 0 && !actif && <span className="w-1.5 h-1.5 rounded-full bg-rust" aria-label={`${alerte} en retard`} />}
    </Link>
  );
}

function ComplaintsWidget({
  complaints,
}: {
  complaints: { id: string; subject: string; submittedByName: string; createdAt: Date; status: string }[];
}) {
  return (
    <CollapsibleSection title={`Réclamations en attente (${complaints.length})`}>
      <div className="flex flex-col">
        {complaints.slice(0, 5).map((c) => (
          <Link
            key={c.id}
            href="/support"
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
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
        <ShowMoreToggle count={complaints.length - 5}>
          <div className="flex flex-col">
            {complaints.slice(5).map((c) => (
              <Link
                key={c.id}
                href="/support"
                className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
              >
                <div className="min-w-0">
                  <span className="text-[12.5px] text-ink font-medium truncate">{c.subject}</span>
                  <span className="text-[12.5px] text-slate"> — {c.submittedByName}</span>
                </div>
                <span className="text-[11px] text-slate shrink-0">{format(c.createdAt, "d MMM", { locale: fr })}</span>
              </Link>
            ))}
          </div>
        </ShowMoreToggle>
      )}
    </CollapsibleSection>
  );
}

// Icône ⓘ + info-bulle CSS pure (group-hover, pas de JS — fonctionne en
// composant serveur). Demandé à l'audit P1 pour expliquer qui voit les
// signalements ; garde la forme d'un hint léger plutôt qu'un paragraphe
// permanent, le bandeau reste compact.
function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex shrink-0">
      <HelpCircle size={13} className="text-slate cursor-help" />
      {/* Ancrée au bord droit de l'icône (s'étend vers la gauche) : centrée,
          elle débordait de l'écran quand l'icône est proche du bord droit
          (mobile, pane étroit). */}
      <span className="absolute right-0 top-5 z-20 hidden group-hover:block w-72 bg-ink text-white text-[11.5px] leading-snug rounded-md px-3 py-2 shadow-lg">
        {children}
      </span>
    </span>
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
    <CollapsibleSection
      title={`Signalements confidentiels (${reports.length})`}
      badge={
        <span className="flex items-center gap-1.5">
          <Pill tone="danger">Accès restreint</Pill>
          <InfoHint>
            Canal de signalement confidentiel (harcèlement, discrimination, dysfonctionnement grave). Seul
            l&apos;administrateur de l&apos;organisme peut lire ces signalements — ni les commerciaux, ni les
            formateurs, ni le DPO externe. Tout le monde peut en déposer un depuis Aide &amp; demandes, y compris
            les apprenants, et de façon anonyme.
          </InfoHint>
        </span>
      }
    >
      <div className="flex flex-col">
        {reports.slice(0, 5).map((r) => (
          <Link
            key={r.id}
            href="/support"
            className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
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
        <ShowMoreToggle count={reports.length - 5}>
          <div className="flex flex-col">
            {reports.slice(5).map((r) => (
              <Link
                key={r.id}
                href="/support"
                className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
              >
                <div className="min-w-0">
                  <span className="text-[12.5px] text-ink font-medium truncate">{r.description.slice(0, 60)}{r.description.length > 60 ? "…" : ""}</span>
                  <span className="text-[12.5px] text-slate"> — {r.reporterName ?? "Anonyme"}</span>
                </div>
                <span className="text-[11px] text-slate shrink-0">{format(r.createdAt, "d MMM", { locale: fr })}</span>
              </Link>
            ))}
          </div>
        </ShowMoreToggle>
      )}
    </CollapsibleSection>
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
    <div className="bg-[#EDDFC6] border border-[#dccba8] rounded-card px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-[12.5px] text-seal-dark">
        Essai <strong>{PLAN_LABELS[plan] ?? plan}</strong> — {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}` : "se termine aujourd'hui"}, sans carte bancaire.
      </div>
      <Link href="/abonnement" className="text-[12px] font-medium text-seal-dark underline decoration-[#dccba8] hover:decoration-seal-dark shrink-0">
        Gérer la facturation
      </Link>
    </div>
  );
}
