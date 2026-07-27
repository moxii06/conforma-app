import { prisma } from "@/lib/prisma";

// Shared by the video/document progress route, the quiz-attempt route, and
// the learner course page. Unlocks "the first not-yet-completed module in
// the course's CURRENT order" rather than "the module whose order follows
// the one just finished": the two are equivalent while the order never
// moves, but staff can reorder modules (or drag a new one to the top)
// after learners have already progressed — under the old rule a module
// moved before the learner's position had no progress row and nothing
// left to ever create one, leaving it "Pas encore accessible" forever and
// the course impossible to finish. Idempotent, so the learner page also
// calls it on load to self-heal dossiers already stranded that way — but
// only once staff has opened access at all (>= 1 progress row): a dossier
// whose e-learning was never started must stay fully locked until the
// explicit assignment flow runs.
export async function unlockNextModuleIfNeeded(params: { dossierId: string; courseId: string }) {
  const [modules, progressList, quizAttempts] = await Promise.all([
    prisma.elearningModule.findMany({
      where: { courseId: params.courseId },
      include: { quiz: { select: { id: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.elearningProgress.findMany({ where: { dossierId: params.dossierId } }),
    prisma.quizAttempt.findMany({ where: { dossierId: params.dossierId }, select: { quizId: true, passed: true } }),
  ]);
  if (progressList.length === 0) return false;

  const progressByModule = new Map(progressList.map((p) => [p.moduleId, p]));
  const frontier = modules.find((m) => !isModuleComplete(m, progressByModule.get(m.id), quizAttempts));
  if (!frontier || progressByModule.has(frontier.id)) return false;

  await prisma.elearningProgress.create({
    data: { dossierId: params.dossierId, moduleId: frontier.id, assignedByName: "Déblocage automatique" },
  });
  return true;
}

// The "access" event that starts a ROLLING (self-paced, no fixed date)
// dossier's completion-deadline clock — see Dossier.firstAccessedAt in
// schema.prisma. Fired from the progress and quiz-attempt routes, i.e. the
// first time the learner actually engages with a module, not when staff
// assigns one to them (assignment goes through a separate route and never
// calls this). updateMany with a null-guard makes it a race-free no-op
// once already set, so callers don't need to check first.
export async function markDossierAccessed(dossierId: string) {
  await prisma.dossier.updateMany({
    where: { id: dossierId, firstAccessedAt: null },
    data: { firstAccessedAt: new Date() },
  });
}

type CompletionModule = { id: string; type: string; quiz: { id: string } | null };
type CompletionProgress = { moduleId: string; percentComplete: number };
type CompletionQuizAttempt = { quizId: string; passed: boolean };

function isModuleComplete(
  module: CompletionModule,
  progress: CompletionProgress | undefined,
  quizAttempts: CompletionQuizAttempt[]
): boolean {
  if (module.type === "quiz" && module.quiz) {
    return quizAttempts.some((a) => a.quizId === module.quiz!.id && a.passed);
  }
  return (progress?.percentComplete ?? 0) >= 100;
}

export type ModuleState = "locked" | "unlocked_not_started" | "in_progress" | "completed";

// A module with no progress row is "locked" (see unlockNextModuleIfNeeded —
// no row means staff/the auto-unlock never opened it), not just "not
// started". Quiz completion is a passing attempt; video/document
// completion is percentComplete reaching 100 — same distinction as
// isModuleComplete above, just resolved into the four UI-facing states
// instead of a plain boolean.
function getModuleState(
  module: CompletionModule,
  progress: CompletionProgress | undefined,
  quizAttempts: CompletionQuizAttempt[]
): ModuleState {
  if (!progress) return "locked";
  if (module.type === "quiz" && module.quiz) {
    const attempts = quizAttempts.filter((a) => a.quizId === module.quiz!.id);
    if (attempts.some((a) => a.passed)) return "completed";
    return attempts.length > 0 ? "in_progress" : "unlocked_not_started";
  }
  if (progress.percentComplete >= 100) return "completed";
  return progress.percentComplete > 0 ? "in_progress" : "unlocked_not_started";
}

// The single place that turns a course's modules + one dossier's progress
// into "what should the learner UI show" — used by the learner catalog
// (aggregate progress bar, current-module link) and the per-course detail
// page (per-module state, which one to auto-expand). Previously
// reimplemented inline in mon-espace/page.tsx; consolidated here once a
// second real caller (the new dedicated course page) needed the exact same
// logic.
export function buildCourseProgress(
  modules: CompletionModule[],
  progressList: CompletionProgress[],
  quizAttempts: CompletionQuizAttempt[]
) {
  const progressByModule = new Map(progressList.map((p) => [p.moduleId, p]));
  const states = new Map<string, ModuleState>();
  let completedCount = 0;
  let currentModuleId: string | null = null;

  for (const m of modules) {
    const state = getModuleState(m, progressByModule.get(m.id), quizAttempts);
    states.set(m.id, state);
    if (state === "completed") completedCount++;
    if (!currentModuleId && (state === "in_progress" || state === "unlocked_not_started")) currentModuleId = m.id;
  }

  const total = modules.length;
  return {
    states,
    completedCount,
    total,
    totalPercent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
    currentModuleId,
    allCompleted: total > 0 && completedCount === total,
  };
}

// Shared by the certificate route and the rolling-access alerts in
// dashboardTasks.ts, which only need the aggregate (not per-module state).
export function getCourseCompletion(
  modules: CompletionModule[],
  progressList: CompletionProgress[],
  quizAttempts: CompletionQuizAttempt[]
) {
  const { completedCount, total, allCompleted } = buildCourseProgress(modules, progressList, quizAttempts);
  return { completedCount, total, allCompleted };
}
