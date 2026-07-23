import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/tenant";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LmsModulePlayer } from "@/components/LmsModulePlayer";
import { QuizTaker } from "@/components/QuizTaker";
import { CourseModulesList, type ModuleRow } from "@/components/CourseModulesList";
import { CourseCertificateButton } from "@/components/CourseCertificateButton";
import { buildCourseProgress } from "@/lib/lms";

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

function formatCourseDuration(session: { mode: string; startsAt: Date; endsAt: Date }, accessDurationDays: number | null) {
  if (session.mode === "ROLLING") {
    return accessDurationDays
      ? `Formation en continu · ${accessDurationDays} j pour la terminer`
      : "Formation en continu · pas de délai imposé";
  }
  const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// The learner's dedicated page for one specific training — reached from
// the "Commencer"/"Continuer ma formation" button on their course
// catalog (/formations for a LEARNER). Deliberately scoped to exactly one
// dossier, never a list: a learner has no legitimate reason to browse
// straight to another learner's dossier by guessing an id, so this checks
// ownership itself rather than relying on the catalog page never linking
// there.
export default async function LearnerCourseDetailPage({ params }: { params: { dossierId: string } }) {
  const session = await requireSessionContext();
  if (session.role !== "LEARNER") redirect("/formations");

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
    include: {
      session: {
        include: {
          trainer: true,
          course: {
            include: {
              elearningModules: {
                include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
    },
  });
  if (!dossier) notFound();

  const modules = dossier.session.course.elearningModules;
  const progress = buildCourseProgress(modules, dossier.elearningProgress, dossier.quizAttempts);
  const progressByModule = new Map(dossier.elearningProgress.map((p) => [p.moduleId, p]));

  const rows: ModuleRow[] = modules.map((m, i) => {
    const state = progress.states.get(m.id)!;
    let node: React.ReactNode = null;

    if (state !== "locked") {
      if (m.type === "quiz" && m.quiz) {
        const quiz = m.quiz;
        const attempts = dossier.quizAttempts.filter((a) => a.quizId === quiz.id);
        const best = attempts.reduce<{ scorePercent: number; passed: boolean } | null>((acc, a) => {
          if (!acc || a.scorePercent > acc.scorePercent) return { scorePercent: a.scorePercent, passed: a.passed };
          return acc;
        }, null);
        // Never send `correct` flags or correctAnswerText to the learner's
        // browser — grading happens server-side only.
        const safeQuestions = quiz.questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          options: Array.isArray(q.options)
            ? (q.options as { id: string; text: string }[]).map((o) => ({ id: o.id, text: o.text }))
            : null,
        }));
        node = (
          <QuizTaker
            quizId={quiz.id}
            dossierId={dossier.id}
            questions={safeQuestions}
            minScorePercent={quiz.minScorePercent}
            maxAttempts={quiz.maxAttempts}
            attemptsUsed={attempts.length}
            bestResult={best}
          />
        );
      } else {
        const p = progressByModule.get(m.id);
        node = (
          <LmsModulePlayer
            dossierId={dossier.id}
            moduleId={m.id}
            type={m.type}
            fileUrl={m.fileUrl}
            percentComplete={p?.percentComplete ?? 0}
            lastPositionSeconds={p?.lastPositionSeconds ?? null}
          />
        );
      }
    }

    return {
      id: m.id,
      title: m.title,
      description: m.description,
      type: m.type as ModuleRow["type"],
      state,
      lockedAfterTitle: state === "locked" && i > 0 ? modules[i - 1].title : null,
      node,
    };
  });

  return (
    <>
      <PageHeader title={dossier.session.course.title} subtitle="Votre formation" />
      <div className="p-8 max-w-2xl flex flex-col gap-5">
        <Link href="/formations" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate hover:text-ink w-fit">
          <ArrowLeft size={14} /> Retour à mes formations
        </Link>

        <div className="bg-white border border-line rounded-card p-5">
          <div className="flex items-center gap-3 text-[12.5px] text-slate mb-1">
            <span>Formateur : {dossier.session.trainer?.name ?? "à confirmer"}</span>
            <span>·</span>
            <span>{formatCourseDuration(dossier.session, dossier.accessDurationDays)}</span>
            {dossier.session.mode === "FIXED_DATE" && (
              <>
                <span>·</span>
                <span>{FORMAT_LABELS[dossier.session.format]}</span>
              </>
            )}
          </div>

          {modules.length === 0 ? (
            <div className="text-[12.5px] text-slate mt-3">Aucun contenu en ligne n&apos;est encore associé à cette formation.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mt-4 mb-1.5">
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">Progression</div>
                <div className="text-[11px] text-slate">{progress.completedCount}/{progress.total} modules terminés</div>
              </div>
              <div className="h-1.5 bg-[#E6E3DA] rounded-full overflow-hidden mb-4">
                <div className="h-full bg-sage" style={{ width: `${progress.totalPercent}%` }} />
              </div>
              <div className="bg-[#EFEDE7] border border-line rounded-md">
                <CourseModulesList rows={rows} defaultExpandedId={progress.currentModuleId} />
              </div>
              {progress.allCompleted && (
                <div className="mt-3.5">
                  <CourseCertificateButton dossierId={dossier.id} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
