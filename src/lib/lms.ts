import { prisma } from "@/lib/prisma";

// Shared by both the video/document progress route and the quiz-attempt
// route — finishing a module unlocks the next one in `order` the same way
// regardless of what kind of module it was, see the auto-unlock comment
// in the progress route for the full "why order, not createdAt" rationale.
export async function unlockNextModuleIfNeeded(params: { dossierId: string; courseId: string; currentOrder: number }) {
  const nextModule = await prisma.elearningModule.findFirst({
    where: { courseId: params.courseId, order: { gt: params.currentOrder } },
    orderBy: { order: "asc" },
  });
  if (!nextModule) return;

  const existing = await prisma.elearningProgress.findFirst({
    where: { dossierId: params.dossierId, moduleId: nextModule.id },
  });
  if (existing) return;

  await prisma.elearningProgress.create({
    data: { dossierId: params.dossierId, moduleId: nextModule.id, assignedByName: "Déblocage automatique" },
  });
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
