import { prisma } from "@/lib/prisma";
import { PageHeader, Pill } from "@/components/ui";
import { requireSessionContext, can } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { LmsModulePlayer } from "@/components/LmsModulePlayer";
import { QuizTaker } from "@/components/QuizTaker";
import { CourseModulesList, type ModuleRow } from "@/components/CourseModulesList";
import { CourseCertificateButton } from "@/components/CourseCertificateButton";

const FORMAT_LABELS: Record<string, string> = { IN_PERSON: "Présentiel", REMOTE: "Distanciel", HYBRID: "Mixte" };

export default async function MonEspacePage() {
  const session = await requireSessionContext();
  if (can(session.role, "portal") === "none") redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Mon espace"
        subtitle={session.role === "LEARNER" ? "Vos dossiers et votre progression" : "Vos sessions à animer"}
      />
      <div className="p-8 max-w-3xl">
        {session.role === "LEARNER" ? (
          <LearnerPortal userId={session.userId} organizationId={session.organizationId} />
        ) : (
          <TrainerPortal userId={session.userId} organizationId={session.organizationId} />
        )}
      </div>
    </>
  );
}

async function LearnerPortal({ userId, organizationId }: { userId: string; organizationId: string }) {
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId, learnerUserId: userId },
    include: {
      session: {
        include: {
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
      documents: true,
      elearningProgress: true,
      quizAttempts: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (dossiers.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucun dossier ne vous est encore associé.</div>;
  }

  // Every module in the course is shown, not just the ones with a progress
  // row — a locked module used to simply not exist as far as the learner
  // portal was concerned, giving no sense of "there's more coming" or how
  // far through the course they are. Sequential unlock (see
  // /api/lms/progress and /api/lms/quiz/[quizId]/attempt) means "no
  // progress row" and "locked" are the same fact; this just makes that fact
  // visible instead of hiding it.
  function renderElearningSection(d: (typeof dossiers)[number]) {
    const modules = d.session.course.elearningModules;
    const progressByModule = new Map(d.elearningProgress.map((p) => [p.moduleId, p]));

    let completedCount = 0;
    let currentModuleId: string | null = null;

    const rows: ModuleRow[] = modules.map((m, i) => {
      const progress = progressByModule.get(m.id);
      let state: ModuleRow["state"];

      if (m.type === "quiz" && m.quiz) {
        const attempts = d.quizAttempts.filter((a) => a.quizId === m.quiz!.id);
        const passed = attempts.some((a) => a.passed);
        if (!progress) state = "locked";
        else if (passed) state = "completed";
        else state = attempts.length > 0 ? "in_progress" : "unlocked_not_started";
      } else {
        const pct = progress?.percentComplete ?? 0;
        if (!progress) state = "locked";
        else if (pct >= 100) state = "completed";
        else if (pct > 0) state = "in_progress";
        else state = "unlocked_not_started";
      }

      if (state === "completed") completedCount++;
      if (!currentModuleId && (state === "in_progress" || state === "unlocked_not_started")) currentModuleId = m.id;

      let node: React.ReactNode = null;
      if (state !== "locked") {
        if (m.type === "quiz" && m.quiz) {
          const quiz = m.quiz;
          const attempts = d.quizAttempts.filter((a) => a.quizId === quiz.id);
          const best = attempts.reduce<{ scorePercent: number; passed: boolean } | null>((acc, a) => {
            if (!acc || a.scorePercent > acc.scorePercent) return { scorePercent: a.scorePercent, passed: a.passed };
            return acc;
          }, null);
          // Never send `correct` flags or correctAnswerText to the
          // learner's browser — grading happens server-side only.
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
              dossierId={d.id}
              questions={safeQuestions}
              minScorePercent={quiz.minScorePercent}
              maxAttempts={quiz.maxAttempts}
              attemptsUsed={attempts.length}
              bestResult={best}
            />
          );
        } else {
          node = (
            <LmsModulePlayer
              dossierId={d.id}
              moduleId={m.id}
              type={m.type}
              fileUrl={m.fileUrl}
              percentComplete={progress?.percentComplete ?? 0}
              lastPositionSeconds={progress?.lastPositionSeconds ?? null}
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

    const totalPercent = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
    const allCompleted = modules.length > 0 && completedCount === modules.length;

    return (
      <>
        <div className="flex items-center justify-between mt-3.5 mb-1.5">
          <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">E-learning</div>
          <div className="text-[11px] text-slate">{completedCount}/{modules.length} modules terminés</div>
        </div>
        <div className="h-1.5 bg-[#F1EFE8] rounded-full overflow-hidden mb-3">
          <div className="h-full bg-sage" style={{ width: `${totalPercent}%` }} />
        </div>
        <div className="bg-[#FAF8F2] border border-line rounded-md">
          <CourseModulesList rows={rows} defaultExpandedId={currentModuleId} />
        </div>
        {allCompleted && (
          <div className="mt-3">
            <CourseCertificateButton dossierId={d.id} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {dossiers.map((d) => {
        const steps = [
          { label: "Recueil des besoins", done: d.needsAssessmentDone },
          { label: "Convention signée", done: d.contractSigned },
          { label: "Convocation reçue", done: d.convocationSent },
          { label: "Évaluation à chaud", done: d.evaluationHotDone },
          { label: "Évaluation à froid", done: d.evaluationColdDone },
        ];
        return (
          <div key={d.id} className="bg-white border border-line rounded-card p-5">
            <div className="text-[13.5px] font-semibold text-ink mb-0.5">{d.session.course.title}</div>
            <div className="text-[12px] text-slate mb-3.5">
              {format(d.session.startsAt, "EEEE d MMMM yyyy", { locale: fr })} · {FORMAT_LABELS[d.session.format]}
            </div>

            {(d.session.format === "REMOTE" || d.session.format === "HYBRID") && d.session.meetingLink && (
              <Link
                href={`/mon-espace/salle/${d.id}`}
                className="inline-block mb-3.5 text-[12.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
              >
                Rejoindre la classe virtuelle
              </Link>
            )}

            <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mb-1.5">Parcours</div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5">
                {s.done ? <CheckCircle2 size={14} className="text-sage" /> : <Circle size={14} className="text-[#C9C4B5]" />}
                <span className="text-[12.5px] text-ink">{s.label}</span>
              </div>
            ))}

            {d.documents.length > 0 && (
              <>
                <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide mt-3.5 mb-1.5">Documents</div>
                {d.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.bodyText ? `/api/documents/generated/${doc.id}` : doc.fileUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[12.5px] text-ink underline decoration-line hover:decoration-ink py-1"
                  >
                    {doc.title}
                  </a>
                ))}
              </>
            )}

            {d.session.course.elearningModules.length > 0 && renderElearningSection(d)}
          </div>
        );
      })}
    </div>
  );
}

async function TrainerPortal({ userId, organizationId }: { userId: string; organizationId: string }) {
  const sessions = await prisma.session.findMany({
    where: { organizationId, trainerId: userId, startsAt: { gte: new Date() } },
    include: {
      course: true,
      dossiers: { include: { contact: true, invitations: { orderBy: { sentAt: "desc" }, take: 1 } } },
    },
    orderBy: { startsAt: "asc" },
  });

  if (sessions.length === 0) {
    return <div className="text-[12.5px] text-slate">Aucune session à venir ne vous est assignée.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => (
        <Link key={s.id} href={`/planning/${s.id}`} className="bg-white border border-line rounded-card p-4 flex items-center gap-4 hover:border-ink-soft block">
          <div className="w-28 shrink-0">
            <div className="text-[12.5px] font-semibold text-ink">{format(s.startsAt, "EEE d MMM", { locale: fr })}</div>
            <div className="text-[11.5px] text-slate">{format(s.startsAt, "HH:mm")}–{format(s.endsAt, "HH:mm")}</div>
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-ink">{s.course.title}</div>
            <div className="text-[11.5px] text-slate mt-0.5">{FORMAT_LABELS[s.format]} · {s.dossiers.length}/{s.capacity} inscrits</div>
          </div>
          <Pill tone={s.dossiers.every((d) => d.invitations.length > 0) && s.dossiers.length > 0 ? "good" : "warn"}>
            {s.dossiers.filter((d) => d.invitations.length > 0).length}/{s.dossiers.length} invités
          </Pill>
        </Link>
      ))}
    </div>
  );
}
