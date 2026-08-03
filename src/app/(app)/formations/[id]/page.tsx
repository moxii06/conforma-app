import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Pill, Avatar, InfoRow, initialsOf } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft, BookOpen, ExternalLink, FileText, HelpCircle, Paperclip, Video, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Tabs } from "@/components/Tabs";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { NewModuleForm } from "@/components/NewModuleForm";
import { NewChapterForm } from "@/components/NewChapterForm";
import { ChapterHeader } from "@/components/ChapterHeader";
import { ModuleChapterSelect } from "@/components/ModuleChapterSelect";
import { ModuleWithdrawalAccessToggle } from "@/components/ModuleWithdrawalAccessToggle";
import { CoursePublicToggle } from "@/components/CoursePublicToggle";
import { CourseVideoSkipToggle } from "@/components/CourseVideoSkipToggle";
import { AssignLearnersPanel } from "@/components/AssignLearnersPanel";
import { RevokeAccessButton } from "@/components/RevokeAccessButton";
import { DeleteModuleButton } from "@/components/DeleteModuleButton";
import { QuizBuilder } from "@/components/QuizBuilder";
import { ModuleReorderList } from "@/components/ModuleReorderList";
import { ReplaceModuleFileForm } from "@/components/ReplaceModuleFileForm";
import { EnrollLearnerPanel } from "@/components/EnrollLearnerPanel";
import { RemoveLearnerButton } from "@/components/RemoveLearnerButton";
import { EditCourseForm } from "@/components/EditCourseForm";
import { ArchiveCourseButton } from "@/components/ArchiveCourseButton";
import { DeleteCourseButton } from "@/components/DeleteCourseButton";
import { DuplicateCourseButton } from "@/components/DuplicateCourseButton";
import { AutomationRulesPanel } from "@/components/AutomationRulesPanel";
import { SatisfactionSurveyEditor } from "@/components/SatisfactionSurveyEditor";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import { TemplateEditor } from "@/components/TemplateEditor";
import { GenerateDocumentButton } from "@/components/GenerateDocumentButton";
import { AddModuleAttachmentForm } from "@/components/AddModuleAttachmentForm";
import { DeleteAttachmentButton } from "@/components/DeleteAttachmentButton";
import { CreateSessionForm } from "@/components/CreateSessionForm";
import { CATEGORY_LABELS } from "@/lib/documentCategories";

const TYPE_ICONS: Record<string, LucideIcon> = { video: Video, document: FileText, quiz: HelpCircle, page: BookOpen };

// Même trois libellés que CreateSessionForm/EditSessionForm — dupliqué là
// où l'app affiche déjà ces valeurs sans lib partagée (pas le sujet ici).
const SESSION_FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

const courseInclude = {
  elearningModules: {
    include: {
      progress: { include: { dossier: { include: { contact: true } } } },
      quiz: { include: { questions: { orderBy: { order: "asc" as const } } } },
      versions: { orderBy: { replacedAt: "desc" as const } },
      attachments: { orderBy: { createdAt: "asc" as const } },
      chapter: { select: { id: true, title: true } },
    },
    orderBy: { order: "asc" as const },
  },
  chapters: { orderBy: { createdAt: "asc" as const } },
  sessions: {
    include: { dossiers: { include: { contact: true } }, trainer: { select: { name: true } } },
    orderBy: { startsAt: "desc" as const },
  },
  responsibleUsers: true,
  subcontractors: true,
  automationRules: { orderBy: { createdAt: "asc" as const } },
  satisfactionSurveys: { include: { questions: { orderBy: { order: "asc" as const } } } },
  // "Modèles" sub-tab of Documents — course-scoped templates only (see
  // DocumentTemplate.courseId); the general Jalon-provided/org-wide library
  // stays on /documents, this is just the per-formation slice of it.
  documentTemplates: { orderBy: { title: "asc" as const } },
  _count: { select: { sessions: true } },
};

const TABS = [
  { key: "resume", label: "Résumé" },
  { key: "apprenants", label: "Apprenants" },
  { key: "contenu", label: "Contenu" },
  { key: "documents", label: "Documents" },
];

// The full management surface for one course — modules, quizzes, roster,
// finances, documents — split out of the catalog list (/formations) so that
// page can stay a scannable summary even with a large catalog, the same
// list-then-detail split already used for Dossiers apprenants and the
// learner's own course view. Tabbed (client feedback: everything used to be
// one long scroll) the same URL-driven ?tab= pattern as /facturation and
// /documents.
export default async function CourseDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; docs?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "courses") === "none" || role === "LEARNER") redirect("/formations");
  const canManage = can(role, "courses") === "full";
  const canToolkit = can(role, "toolkit") !== "none";
  const canSeeMoney = can(role, "invoicing") !== "none";
  const activeTab = searchParams.tab && TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : "resume";
  const docsView = searchParams.docs === "signes" ? "signes" : "modeles";

  const [course, members, subcontractors, trainers] = await Promise.all([
    prisma.course.findFirst({ where: { id: params.id, organizationId }, include: courseInclude }),
    canManage
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: { not: "LEARNER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.subcontractor.findMany({
          where: { organizationId, status: "active" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Pour le formulaire "+ Nouvelle session" de l'onglet Résumé — le même
    // besoin que /planning, ici scopé à cette seule formation.
    canManage
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: Role.TRAINER },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  if (!course) notFound();
  // Same "own courses only" boundary as the catalog list (/formations) —
  // without it, a trainer could still reach any course's full roster and
  // per-learner progress by guessing/following a link, even once the list
  // itself stopped showing it to them.
  if (
    role === Role.TRAINER &&
    !course.sessions.some((s) => s.trainerId === userId) &&
    !course.subcontractors.some((s) => s.linkedUserId === userId) &&
    !course.responsibleUsers.some((u) => u.id === userId)
  ) {
    redirect("/formations");
  }

  const courseDossiers = course.sessions.flatMap((s) =>
    s.dossiers.map((d) => ({ id: d.id, contactName: `${d.contact.firstName} ${d.contact.lastName}` }))
  );
  const courseDossierIds = courseDossiers.map((d) => d.id);
  const rollingSessionCount = course.sessions.filter((s) => s.mode === "ROLLING").length;

  const [financials, signedDocuments] = await Promise.all([
    activeTab === "resume" && canSeeMoney && courseDossierIds.length > 0
      ? Promise.all([
          prisma.invoice.aggregate({ where: { dossierId: { in: courseDossierIds } }, _sum: { amountCents: true }, _count: true }),
          prisma.payment.aggregate({ where: { invoice: { dossierId: { in: courseDossierIds } } }, _sum: { amountCents: true } }),
        ])
      : Promise.resolve(null),
    activeTab === "documents" && docsView === "signes" && courseDossierIds.length > 0
      ? prisma.document.findMany({
          where: { organizationId, dossierId: { in: courseDossierIds }, signatureStatus: "signed" },
          include: { dossier: { include: { contact: true } } },
          orderBy: { signedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const learnerCount = course.sessions.reduce((n, s) => n + s.dossiers.length, 0);
  const courseInitials = initialsOf(course.title);
  const formatAmountCard = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <>
      <PageHeader title={course.title} subtitle={course.archivedAt ? "Formation archivée" : "Gestion de la formation"} />
      <Tabs basePath={`/formations/${course.id}`} tabs={TABS} active={activeTab} />
      <div className="p-8 max-w-5xl">
        <Link href="/formations" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate hover:text-ink w-fit mb-4">
          <ArrowLeft size={14} /> Retour au catalogue
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        <div className="bg-white border border-line rounded-card p-5 lg:sticky lg:top-6">
          <Avatar initials={courseInitials} />
          <div className="font-display text-[18px] text-ink mt-3 leading-snug">{course.title}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {course.archivedAt ? <Pill tone="neutral">Archivée</Pill> : <Pill tone="good">Active</Pill>}
            {rollingSessionCount > 0 && <Pill tone="neutral">En continu</Pill>}
          </div>
          <div className="mt-4">
            <div className="text-[12px] text-slate mb-1">Prix catalogue</div>
            <div className="text-2xl font-mono font-semibold tabular-nums text-ink">
              {course.priceCents != null ? formatAmountCard(course.priceCents) : "—"}
            </div>
            {course.durationHours != null && <div className="text-[11.5px] text-slate mt-1">{course.durationHours} h de formation</div>}
          </div>
          <div className="mt-4 pt-4 border-t border-line flex flex-col gap-2.5">
            <InfoRow label="Apprenants">
              {course.maxLearners != null ? `${learnerCount}/${course.maxLearners}` : `${learnerCount} · illimité`}
            </InfoRow>
            <InfoRow label="Sessions">{course._count.sessions}</InfoRow>
            {course.responsibleUsers.length > 0 && (
              <InfoRow label="Responsables">{course.responsibleUsers.map((u) => u.name).join(", ")}</InfoRow>
            )}
            {course.subcontractors.length > 0 && (
              <InfoRow label="Prestataires">{course.subcontractors.map((s) => s.name).join(", ")}</InfoRow>
            )}
            <InfoRow label="Modules">{course.elearningModules.length}</InfoRow>
          </div>
        </div>

        <div className="flex flex-col gap-4">
        {activeTab === "resume" && (
          <ResumeTab
            course={course}
            members={members}
            subcontractors={subcontractors}
            trainers={trainers}
            canManage={canManage}
            canSeeMoney={canSeeMoney}
            rollingSessionCount={rollingSessionCount}
            sessionCount={course._count.sessions}
            financials={financials}
          />
        )}

        {activeTab === "apprenants" && <ApprenantsTab course={course} courseDossiers={courseDossiers} canManage={canManage} />}

        {activeTab === "contenu" && <ContenuTab course={course} courseDossiers={courseDossiers} canManage={canManage} />}

        {activeTab === "documents" && (
          <DocumentsTab
            course={course}
            courseDossiers={courseDossiers}
            canWrite={canToolkit}
            docsView={docsView}
            signedDocuments={signedDocuments}
          />
        )}
        </div>
        </div>
      </div>
    </>
  );
}

type CourseWithIncludes = NonNullable<Awaited<ReturnType<typeof prisma.course.findFirst<{ include: typeof courseInclude }>>>>;

function ResumeTab({
  course,
  members,
  subcontractors,
  trainers,
  canManage,
  canSeeMoney,
  rollingSessionCount,
  sessionCount,
  financials,
}: {
  course: CourseWithIncludes;
  members: { id: string; name: string }[];
  subcontractors: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  canManage: boolean;
  canSeeMoney: boolean;
  rollingSessionCount: number;
  sessionCount: number;
  financials: [{ _sum: { amountCents: number | null }; _count: number }, { _sum: { amountCents: number | null } }] | null;
}) {
  const formatAmount = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  return (
    <div className="bg-white border border-line rounded-card p-4 flex flex-col gap-4">
      {(course.description || course.certificateValidityMonths != null) && (
        <div>
          {course.description && <div className="text-[12px] text-slate">{course.description}</div>}
          {course.certificateValidityMonths != null && (
            <div className="text-[11px] text-slate mt-1">
              Attestation valable {course.certificateValidityMonths} mois — renouvellement à prévoir
            </div>
          )}
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-3">
          <EditCourseForm
            courseId={course.id}
            members={members}
            subcontractors={subcontractors}
            initial={{
              title: course.title,
              description: course.description,
              responsibleUserIds: course.responsibleUsers.map((u) => u.id),
              subcontractorIds: course.subcontractors.map((s) => s.id),
              durationHours: course.durationHours,
              priceCents: course.priceCents,
              certificateValidityMonths: course.certificateValidityMonths,
              maxLearners: course.maxLearners,
              prerequisites: course.prerequisites,
              objectives: course.objectives,
              accessDelay: course.accessDelay,
              accessModalities: course.accessModalities,
              teachingMethods: course.teachingMethods,
              evaluationModalities: course.evaluationModalities,
            }}
          />
          <DuplicateCourseButton courseId={course.id} />
          <ArchiveCourseButton courseId={course.id} archived={Boolean(course.archivedAt)} />
          <DeleteCourseButton courseId={course.id} courseTitle={course.title} />
        </div>
      )}

      {/* Avant, créer une session pour cette formation obligeait à aller sur
          /planning et à la retrouver dans une liste déroulante — la
          retrouver, pas la choisir, puisqu'on venait de la quitter. La
          session créée ici est la même que celle du planning (mêmes
          tables, mêmes routes) : elle y apparaît immédiatement, dans
          l'onglet daté ou dans « En continu » selon son mode. */}
      <div className="border-t border-line pt-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
            Sessions ({sessionCount})
          </div>
        </div>
        {course.sessions.length > 0 && (
          <div className="flex flex-col">
            {course.sessions.map((s) => {
              const isCancelled = s.status === "CANCELLED";
              const isRolling = s.mode === "ROLLING";
              return (
                <Link
                  key={s.id}
                  href={`/planning/${s.id}`}
                  className="flex items-center gap-3 py-2 border-t border-line first:border-t-0 hover:bg-linen -mx-1 px-1 rounded"
                >
                  <div className="w-32 shrink-0 text-[12px] text-ink">
                    {isRolling ? "Toujours ouverte" : format(s.startsAt, "d MMM yyyy", { locale: fr })}
                  </div>
                  <div className="flex-1 min-w-0 text-[12px] text-slate truncate">
                    {SESSION_FORMAT_LABELS[s.format]}
                    {s.trainer ? ` · ${s.trainer.name}` : ""}
                  </div>
                  <div className="text-[11.5px] text-slate shrink-0">
                    {isRolling ? `${s.dossiers.length} inscrit${s.dossiers.length > 1 ? "s" : ""}` : `${s.dossiers.length}/${s.capacity}`}
                  </div>
                  <div className="shrink-0">
                    {isCancelled ? (
                      <Pill tone="danger">Annulée</Pill>
                    ) : (
                      <Pill tone={s.trainer ? "good" : "danger"}>{s.trainer ? "Confirmée" : "Formateur à confirmer"}</Pill>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {canManage && <CreateSessionForm courses={[]} trainers={trainers} lockedCourse={{ id: course.id, title: course.title }} />}
      </div>

      {canManage && (
        <div className="border-t border-line pt-3.5 flex flex-col gap-1.5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
            Fiche formation publique
          </div>
          <div className="text-[11.5px] text-slate">
            Les informations obligatoires de l&apos;indicateur Qualiopi 1 (prérequis, objectifs, tarifs, délais et
            modalités d&apos;accès, accessibilité…) publiées sur une page ouverte au public.
          </div>
          <CoursePublicToggle courseId={course.id} isPublic={course.isPublic} publicEnrollment={course.publicEnrollment} />
        </div>
      )}

      {canManage && (
        <div className="border-t border-line pt-3.5 flex flex-col gap-1.5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
            Modules vidéo
          </div>
          <div className="text-[11.5px] text-slate">
            Autoriser l&apos;apprenant à passer une vidéo sans la regarder en entier (avec avertissement) — désactivé
            par défaut. La suite du parcours se débloque quand même, mais c&apos;est visible comme tel tant que la
            vidéo n&apos;a pas été réellement regardée en entier.
          </div>
          <CourseVideoSkipToggle courseId={course.id} allowVideoSkip={course.allowVideoSkip} />
        </div>
      )}

      {canSeeMoney && (
        <div className="border-t border-line pt-3.5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-2">Données financières</div>
          {financials ? (
            <div className="flex gap-3.5">
              <div className="bg-linen border border-line rounded-card p-3 flex-1">
                <div className="text-[11.5px] text-slate mb-1.5">Facturé</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-ink">{formatAmount(financials[0]._sum.amountCents ?? 0)}</div>
                <div className="text-[11px] text-slate mt-1">
                  {financials[0]._count} facture{financials[0]._count > 1 ? "s" : ""}
                </div>
              </div>
              <div className="bg-linen border border-line rounded-card p-3 flex-1">
                <div className="text-[11.5px] text-slate mb-1.5">Encaissé</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-sage">{formatAmount(financials[1]._sum.amountCents ?? 0)}</div>
              </div>
            </div>
          ) : (
            <div className="text-[11.5px] text-slate">Aucun apprenant facturé pour l&apos;instant.</div>
          )}
        </div>
      )}

      {canManage && (
        <div className="border-t border-line pt-3.5">
          <AutomationRulesPanel courseId={course.id} rules={course.automationRules} />
        </div>
      )}

      {canManage && (
        <div className="border-t border-line pt-3.5 flex flex-col gap-3">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Positionnement et satisfaction</div>
          <SatisfactionSurveyEditor
            courseId={course.id}
            kind="positioning"
            initialQuestions={
              course.satisfactionSurveys.find((s) => s.kind === "positioning")?.questions.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                options: q.options as { id: string; text: string }[] | null,
              })) ?? []
            }
          />
          <SatisfactionSurveyEditor
            courseId={course.id}
            kind="hot"
            initialQuestions={
              course.satisfactionSurveys.find((s) => s.kind === "hot")?.questions.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                options: q.options as { id: string; text: string }[] | null,
              })) ?? []
            }
          />
          <SatisfactionSurveyEditor
            courseId={course.id}
            kind="cold"
            initialQuestions={
              course.satisfactionSurveys.find((s) => s.kind === "cold")?.questions.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                options: q.options as { id: string; text: string }[] | null,
              })) ?? []
            }
          />
        </div>
      )}
    </div>
  );
}

function ApprenantsTab({
  course,
  courseDossiers,
  canManage,
}: {
  course: CourseWithIncludes;
  courseDossiers: { id: string; contactName: string }[];
  canManage: boolean;
}) {
  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
            Apprenants inscrits ({courseDossiers.length}
            {course.maxLearners != null ? `/${course.maxLearners}` : ""})
          </div>
          {course.maxLearners != null && courseDossiers.length >= course.maxLearners && <Pill tone="warn">Complet</Pill>}
        </div>
        {canManage && <EnrollLearnerPanel courseId={course.id} />}
      </div>
      {courseDossiers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {courseDossiers.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-t border-line first:border-t-0 pt-2 first:pt-0">
              <Link href={`/dossiers/${d.id}`} className="text-[13px] text-ink hover:underline">
                {d.contactName}
              </Link>
              {canManage && <RemoveLearnerButton dossierId={d.id} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-slate">Aucun apprenant inscrit pour l&apos;instant.</div>
      )}
    </div>
  );
}

// Module progress used to be a bare "72%" number next to each name — a
// small filled track reads at a glance across a dozen rows in a way a
// column of digits doesn't, and color (sage at 100%, seal otherwise) flags
// completion without adding another badge.
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex-1 h-1.5 bg-pebble rounded-full overflow-hidden min-w-[48px]">
      <div
        className={`h-full rounded-full ${percent >= 100 ? "bg-sage" : "bg-seal"}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

function ContenuTab({
  course,
  courseDossiers,
  canManage,
}: {
  course: CourseWithIncludes;
  courseDossiers: { id: string; contactName: string }[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {(() => {
        const rows: { id: string; node: React.ReactNode; draggable?: boolean }[] = [];
        // Chapters have no order field of their own (see Chapter model
        // comment) — their visual position falls out of wherever their
        // member modules land in the already globally-ordered module list.
        // Walking that list and inserting a header each time chapterId
        // changes to a new value reconstructs contiguous chapter groups
        // without touching module.order or the reorder API at all.
        let lastChapterId: string | null | undefined = undefined;

        for (const m of course.elearningModules) {
          if (m.chapterId !== lastChapterId) {
            lastChapterId = m.chapterId;
            if (m.chapter) {
              rows.push({
                // rows.length suffix: the same chapter can appear as several
                // non-contiguous runs (a module reassigned from afar) — each
                // run gets its own header row, so the id must be unique per
                // run, not per chapter.
                id: `chapter-header-${m.chapter.id}-${rows.length}`,
                draggable: false,
                node: <ChapterHeader chapterId={m.chapter.id} title={m.chapter.title} />,
              });
            }
          }

          const assignedIds = new Set(m.progress.map((p) => p.dossierId));
          const eligible = courseDossiers.filter((d) => !assignedIds.has(d.id));
          const avgPercent =
            m.progress.length > 0 ? Math.round(m.progress.reduce((sum, p) => sum + p.percentComplete, 0) / m.progress.length) : null;
          const Icon = TYPE_ICONS[m.type] ?? FileText;
          const badgeParts: string[] = [];
          if (m.type === "quiz") {
            const n = m.quiz?.questions.length ?? 0;
            badgeParts.push(`${n} question${n > 1 ? "s" : ""}`);
          }
          if (m.progress.length > 0) badgeParts.push(`${m.progress.length} apprenant${m.progress.length > 1 ? "s" : ""} · ${avgPercent}%`);

          rows.push({
            id: m.id,
            node: (
              <CollapsibleSection
                title={
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-linen text-seal-dark shrink-0">
                      <Icon size={13} />
                    </span>
                    <span className="text-[13.5px] font-medium text-ink truncate">{m.title}</span>
                  </span>
                }
                badge={badgeParts.length > 0 ? <Pill tone={avgPercent === 100 ? "good" : "neutral"}>{badgeParts.join(" · ")}</Pill> : undefined}
                extra={
                  canManage ? (
                    <div className="flex items-center gap-1.5">
                      <ModuleWithdrawalAccessToggle moduleId={m.id} availableDuringWithdrawal={m.availableDuringWithdrawal} />
                      {course.chapters.length > 0 && (
                        <ModuleChapterSelect moduleId={m.id} chapterId={m.chapterId} chapters={course.chapters} />
                      )}
                    </div>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-3.5">
                  {/* Sanitized at save time (sanitizeRichText, src/lib/richText.ts) before
                      persistence — safe to render as HTML here. */}
                  {m.description && <div className="text-[12px] text-slate" dangerouslySetInnerHTML={{ __html: m.description }} />}

                  {(m.type === "video" || m.type === "document") && (
                    <div className="flex items-center gap-4 flex-wrap">
                      {m.fileUrl ? (
                        <a
                          href={`/api/lms/modules/${m.id}/stream`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink underline decoration-line hover:decoration-ink"
                        >
                          <ExternalLink size={12} /> Voir le fichier
                        </a>
                      ) : (
                        <span className="text-[11.5px] text-rust">Aucun fichier déposé</span>
                      )}
                      {canManage && <ReplaceModuleFileForm moduleId={m.id} type={m.type} />}
                    </div>
                  )}
                  {m.versions.length > 0 && (
                    <details className="text-[11px] text-slate">
                      <summary className="cursor-pointer">Historique des fichiers ({m.versions.length})</summary>
                      <div className="flex flex-col gap-0.5 mt-1 pl-2">
                        {m.versions.map((v) => (
                          <div key={v.id}>
                            {v.fileUrl ? (
                              <a href={`/api/lms/modules/versions/${v.id}/file`} target="_blank" rel="noreferrer" className="underline decoration-line hover:decoration-ink">
                                {v.fileName ?? "Fichier"}
                              </a>
                            ) : (
                              "Fichier"
                            )}{" "}
                            — remplacé le {new Date(v.replacedAt).toLocaleDateString("fr-FR")} par {v.replacedByName}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
                    <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide flex items-center gap-1.5">
                      <Paperclip size={11} /> Documents complémentaires
                    </div>
                    {m.attachments.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {m.attachments.map((a) => (
                          <div key={a.id} className="flex items-center gap-2">
                            <a
                              href={`/api/lms/modules/attachments/${a.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] text-ink underline decoration-line hover:decoration-ink truncate"
                            >
                              {a.title}
                            </a>
                            {canManage && <DeleteAttachmentButton attachmentId={a.id} />}
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && <AddModuleAttachmentForm moduleId={m.id} />}
                  </div>

                  {m.type === "quiz" && canManage && (
                    <QuizBuilder
                      moduleId={m.id}
                      quizId={m.quiz?.id ?? null}
                      minScorePercent={m.quiz?.minScorePercent ?? 70}
                      maxAttempts={m.quiz?.maxAttempts ?? null}
                      questions={m.quiz?.questions ?? []}
                    />
                  )}

                  <div className="flex flex-col gap-2 border-t border-line pt-3.5">
                    <div className="text-[10.5px] font-semibold text-slate uppercase tracking-wide">Progression des apprenants</div>
                    {m.progress.length > 0 ? (
                      m.progress.map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <span className="text-[12px] text-ink w-32 truncate shrink-0">
                            {p.dossier.contact.firstName} {p.dossier.contact.lastName}
                          </span>
                          <ProgressBar percent={p.percentComplete} />
                          <span className="text-[11px] text-slate w-9 text-right tabular-nums shrink-0">{p.percentComplete}%</span>
                          {canManage && (
                            <RevokeAccessButton
                              progressId={p.id}
                              learnerName={`${p.dossier.contact.firstName} ${p.dossier.contact.lastName}`}
                            />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-[11.5px] text-slate">Aucun apprenant assigné.</div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center justify-between gap-3.5 border-t border-line pt-3.5">
                      <AssignLearnersPanel moduleId={m.id} eligibleDossiers={eligible} />
                      <DeleteModuleButton moduleId={m.id} />
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            ),
          });
        }
        return canManage && course.elearningModules.length > 1 ? (
          <ModuleReorderList courseId={course.id} items={rows} />
        ) : (
          rows.map((r) => <div key={r.id}>{r.node}</div>)
        );
      })()}
      {course.elearningModules.length === 0 && (
        <div className="bg-white border border-line rounded-card p-6 text-center text-[12.5px] text-slate">Aucun module pour l&apos;instant.</div>
      )}
      {canManage && (
        <div className="bg-white border border-line rounded-card p-4 flex items-start gap-4">
          <NewModuleForm courseId={course.id} chapters={course.chapters} />
          <NewChapterForm courseId={course.id} />
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  course,
  courseDossiers,
  canWrite,
  docsView,
  signedDocuments,
}: {
  course: CourseWithIncludes;
  courseDossiers: { id: string; contactName: string }[];
  canWrite: boolean;
  docsView: "modeles" | "signes";
  signedDocuments: Awaited<ReturnType<typeof prisma.document.findMany<{ include: { dossier: { include: { contact: true } } } }>>>;
}) {
  const dossierOptions = courseDossiers.map((d) => ({ id: d.id, label: d.contactName }));
  const pillClass = (isActive: boolean) =>
    `px-3 py-1.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${
      isActive ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 border-b border-line">
        <Link href={`/formations/${course.id}?tab=documents`} className={pillClass(docsView === "modeles")}>
          Modèles
        </Link>
        <Link href={`/formations/${course.id}?tab=documents&docs=signes`} className={pillClass(docsView === "signes")}>
          Documents signés
        </Link>
      </div>

      {docsView === "modeles" ? (
        <div className="flex flex-col gap-3">
          <div className="text-[11.5px] text-slate">
            Modèles de contrat, convention, attestation… personnalisés pour cette formation (distincts de la
            bibliothèque générale — voir{" "}
            <a href="/documents" className="underline decoration-line hover:decoration-ink">
              Bibliothèque de documents
            </a>
            ).
          </div>
          {course.documentTemplates.length > 0 && (
            <div className="bg-white border border-line rounded-card p-4">
              {course.documentTemplates.map((t) => (
                <details key={t.id} className="border-t border-line first:border-t-0 py-2.5">
                  <summary className="cursor-pointer list-none text-[13px] text-ink font-medium">
                    {CATEGORY_LABELS[t.category] ?? t.category} — {t.title}
                  </summary>
                  <div className="mt-2.5 flex flex-col gap-2.5">
                    {canWrite ? (
                      <TemplateEditor templateId={t.id} title={t.title} bodyText={t.bodyText} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-[12px] text-slate font-sans leading-relaxed">{t.bodyText}</pre>
                    )}
                    <GenerateDocumentButton templateId={t.id} dossiers={dossierOptions} />
                  </div>
                </details>
              ))}
            </div>
          )}
          {course.documentTemplates.length === 0 && (
            <div className="text-[12px] text-slate py-1">Aucun modèle propre à cette formation pour l&apos;instant.</div>
          )}
          {canWrite && <NewTemplateForm fixedCourse={{ id: course.id, title: course.title }} />}
        </div>
      ) : (
        <div className="bg-white border border-line rounded-card">
          {signedDocuments.map((doc) => (
            <a
              key={doc.id}
              href={doc.bodyText ? `/api/documents/generated/${doc.id}` : `/api/documents/${doc.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 hover:bg-linen"
            >
              <Pill tone="good">{CATEGORY_LABELS[doc.category] ?? doc.category}</Pill>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-ink font-medium truncate">{doc.title}</div>
                {doc.dossier && (
                  <div className="text-[11.5px] text-slate truncate">
                    {doc.dossier.contact.firstName} {doc.dossier.contact.lastName}
                  </div>
                )}
              </div>
              <div className="text-[11px] text-slate shrink-0">
                {doc.signedAt ? format(doc.signedAt, "d MMM yyyy", { locale: fr }) : ""}
              </div>
            </a>
          ))}
          {signedDocuments.length === 0 && (
            <div className="px-4 py-6 text-[12.5px] text-slate text-center">Aucun document signé pour cette formation pour l&apos;instant.</div>
          )}
        </div>
      )}
    </div>
  );
}
