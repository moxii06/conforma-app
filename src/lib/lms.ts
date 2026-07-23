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

// Shared by the certificate route and the rolling-access alerts in
// dashboardTasks.ts — "is every module in this course done for this
// dossier" always means the same thing (quiz: a passing attempt; video/doc:
// percentComplete >= 100), so it shouldn't be reimplemented per caller.
export function getCourseCompletion(
  modules: CompletionModule[],
  progressList: CompletionProgress[],
  quizAttempts: CompletionQuizAttempt[]
) {
  const progressByModule = new Map(progressList.map((p) => [p.moduleId, p]));
  const completedCount = modules.filter((m) => isModuleComplete(m, progressByModule.get(m.id), quizAttempts)).length;
  return { completedCount, total: modules.length, allCompleted: modules.length > 0 && completedCount === modules.length };
}
