import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MetricCard, PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { CreateCourseForm } from "@/components/CreateCourseForm";
import { ArchiveCourseButton } from "@/components/ArchiveCourseButton";
import { Tabs } from "@/components/Tabs";
import { SearchInput } from "@/components/SearchInput";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { buildCourseProgress } from "@/lib/lms";
import { CourseCertificateButton } from "@/components/CourseCertificateButton";

const TABS = [
  { key: "catalogue", label: "Catalogue" },
  { key: "archivees", label: "Archivées" },
];

type SessionSummary = { mode: string; status: string; capacity: number; startsAt: Date; _count: { dossiers: number } };

// One line per course, not the full management surface — see
// /formations/[id] for that. A course's status/secondary line summarizes
// across its sessions rather than assuming there's exactly one: several
// real sessions is the common case once a course has been running a while.
function summarizeSessions(sessions: SessionSummary[]): { pillLabel: string | null; pillTone: "good" | "warn" | "danger"; secondary: string } {
  if (sessions.length === 0) return { pillLabel: null, pillTone: "warn", secondary: "Aucune session" };
  const anyFull = sessions.some((s) => s._count.dossiers >= s.capacity);
  const anyDraft = sessions.some((s) => s.status === "DRAFT");
  const pillLabel = anyFull ? "Complet" : anyDraft ? "Brouillon" : "Confirmée";
  const pillTone = anyFull ? "danger" : anyDraft ? "warn" : "good";
  const secondary =
    sessions.length === 1
      ? sessions[0].mode === "ROLLING"
        ? "En continu"
        : format(sessions[0].startsAt, "d MMM", { locale: fr })
      : `${sessions.length} sess.`;
  return { pillLabel, pillTone, secondary };
}

export default async function FormationsPage({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const { organizationId, role, userId } = await requireSessionContext();
  if (can(role, "planning") === "none") redirect("/dashboard");
  // A learner gets a completely different page here, not just a read-only
  // version of the staff one — the staff view lists every course org-wide
  // with every enrolled learner's name (needed for staff to manage
  // rosters), which is exactly what a learner must never see about their
  // classmates. Scoped to their own dossiers only, see LearnerCatalog below.
  if (role === "LEARNER") return <LearnerCatalog userId={userId} organizationId={organizationId} />;
  const canManage = can(role, "planning") === "full";
  const activeTab = searchParams.tab === "archivees" ? "archivees" : "catalogue";
  const q = searchParams.q?.trim();

  const [courses, members, sessionsInProgress, activeLearnerCount] = await Promise.all([
    prisma.course.findMany({
      where: {
        organizationId,
        archivedAt: activeTab === "archivees" ? { not: null } : null,
        ...(activeTab === "archivees" && q
          ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      include: {
        sessions: {
          select: { mode: true, status: true, capacity: true, startsAt: true, _count: { select: { dossiers: true } } },
        },
        _count: { select: { sessions: true } },
      },
      orderBy: activeTab === "archivees" ? { archivedAt: "desc" } : { title: "asc" },
    }),
    canManage
      ? prisma.user.findMany({
          where: { organizationId, status: "active", role: { not: "LEARNER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Same definition as the dashboard metric: only fixed-date sessions
    // currently within their scheduled window — a rolling session has no
    // real start/end, so it would otherwise always count as "in progress."
    prisma.session.count({
      where: { organizationId, mode: "FIXED_DATE", startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    }),
    prisma.dossier.findMany({
      where: { organizationId, session: { course: { archivedAt: null } } },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);

  return (
    <>
      <PageHeader title="Catalogue de formations" subtitle="Cours et modules e-learning associés" />
      <Tabs basePath="/formations" tabs={TABS} active={activeTab} />
      <div className="p-8 flex flex-col gap-4 max-w-2xl">
        {activeTab === "catalogue" ? (
          <>
            <div className="flex gap-3.5">
              <MetricCard label="Sessions en cours" value={String(sessionsInProgress)} />
              <MetricCard label="Apprenants actifs" value={String(activeLearnerCount.length)} />
            </div>
            {canManage && <CreateCourseForm members={members} />}
            <div className="flex flex-col gap-2">
              {courses.map((course) => {
                const { pillLabel, pillTone, secondary } = summarizeSessions(course.sessions);
                return (
                  <Link
                    key={course.id}
                    href={`/formations/${course.id}`}
                    className="bg-white border border-line rounded-card px-4.5 py-3.5 flex items-center justify-between gap-4 hover:border-ink-soft"
                  >
                    <div className="text-[13.5px] font-semibold text-ink truncate">{course.title}</div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {pillLabel && <Pill tone={pillTone}>{pillLabel}</Pill>}
                      <div className="text-[12px] text-slate w-16 text-right">{secondary}</div>
                    </div>
                  </Link>
                );
              })}
              {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucun cours — créez-en un ci-dessus.</div>}
            </div>
          </>
        ) : (
          <>
            <SearchInput placeholder="Rechercher une formation archivée…" />
            <div className="flex flex-col gap-2">
              {courses.map((course) => {
                const learnerCount = course.sessions.reduce((sum, s) => sum + s._count.dossiers, 0);
                return (
                  <div key={course.id} className="bg-white border border-line rounded-card px-4.5 py-3.5 flex items-center justify-between gap-3">
                    <Link href={`/formations/${course.id}`} className="min-w-0 hover:underline">
                      <div className="text-[13.5px] font-semibold text-ink truncate">{course.title}</div>
                      <div className="text-[11px] text-slate mt-0.5">
                        {learnerCount} apprenant{learnerCount > 1 ? "s" : ""} · {course._count.sessions} session(s)
                        {course.archivedAt && ` · archivée le ${format(course.archivedAt, "d MMM yyyy", { locale: fr })}`}
                      </div>
                    </Link>
                    {canManage && <ArchiveCourseButton courseId={course.id} archived />}
                  </div>
                );
              })}
              {courses.length === 0 && <div className="text-[12.5px] text-slate">Aucune formation archivée{q ? " pour cette recherche" : ""}.</div>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function formatLearnerCourseDuration(session: { mode: string; startsAt: Date; endsAt: Date }, accessDurationDays: number | null) {
  if (session.mode === "ROLLING") {
    return accessDurationDays ? `En continu · ${accessDurationDays} j pour terminer` : "En continu · sans délai imposé";
  }
  const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

async function LearnerCatalog({ userId, organizationId }: { userId: string; organizationId: string }) {
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId, learnerUserId: userId },
    include: {
      session: {
        include: {
          trainer: true,
          course: { include: { elearningModules: { include: { quiz: true }, orderBy: { order: "asc" } } } },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader title="Mes formations" subtitle="Vos formations, votre progression" />
      <div className="p-8 flex flex-col gap-3 max-w-2xl">
        {dossiers.map((d) => (
          <LearnerCourseCard key={d.id} dossier={d} />
        ))}
        {dossiers.length === 0 && <div className="text-[12.5px] text-slate">Aucune formation ne vous est encore associée.</div>}
      </div>
    </>
  );
}

function LearnerCourseCard({
  dossier,
}: {
  dossier: {
    id: string;
    accessDurationDays: number | null;
    firstAccessedAt: Date | null;
    session: {
      mode: string;
      startsAt: Date;
      endsAt: Date;
      trainer: { name: string } | null;
      course: { title: string; elearningModules: { id: string; type: string; quiz: { id: string } | null }[] };
    };
    elearningProgress: { moduleId: string; percentComplete: number }[];
    quizAttempts: { quizId: string; passed: boolean }[];
  };
}) {
  const modules = dossier.session.course.elearningModules;
  const hasContent = modules.length > 0;
  const progress = hasContent ? buildCourseProgress(modules, dossier.elearningProgress, dossier.quizAttempts) : null;
  // "Commencer" vs "Continuer" tracks real engagement (firstAccessedAt,
  // set the moment any module is actually opened — see markDossierAccessed
  // in lib/lms.ts), not full-module completion: a learner 60% through the
  // first video has clearly "started," even though completedCount is
  // still 0.
  const ctaLabel = !progress || !dossier.firstAccessedAt ? "Commencer ma formation" : progress.allCompleted ? "Revoir ma formation" : "Continuer ma formation";

  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="text-[13.5px] font-semibold text-ink mb-0.5">{dossier.session.course.title}</div>
      <div className="text-[12px] text-slate mb-3">
        Formateur : {dossier.session.trainer?.name ?? "à confirmer"} · {formatLearnerCourseDuration(dossier.session, dossier.accessDurationDays)}
      </div>

      {hasContent ? (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-slate uppercase tracking-wide font-semibold">Progression</div>
            <div className="text-[11px] text-slate">{progress!.completedCount}/{progress!.total} modules</div>
          </div>
          <div className="h-1.5 bg-[#E6E3DA] rounded-full overflow-hidden mb-3.5">
            <div className="h-full bg-sage" style={{ width: `${progress!.totalPercent}%` }} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/mon-espace/formation/${dossier.id}`}
              className="inline-block bg-ink text-white text-[12.5px] font-medium rounded-md px-3.5 py-2 hover:bg-ink-soft"
            >
              {ctaLabel}
            </Link>
            {progress!.allCompleted && <CourseCertificateButton dossierId={dossier.id} />}
          </div>
        </>
      ) : (
        <div className="text-[12px] text-slate">Aucun contenu en ligne pour l&apos;instant.</div>
      )}
    </div>
  );
}
