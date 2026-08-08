import { prisma } from "@/lib/prisma";

/**
 * L'héritage des règles du parcours : la SESSION d'abord, la formation
 * ensuite.
 *
 * `null` côté session veut dire « je n'ai pas d'avis », jamais « désactivé ».
 * C'est ce qui rend la migration inoffensive : les colonnes arrivent à null
 * sur toutes les sessions existantes, et chacune continue donc de suivre
 * exactement le réglage de sa formation.
 *
 * Pourquoi ce cran supplémentaire : une même formation se vend en parcours
 * certifiant à une promotion (l'ordre des modules porte la progression) et
 * en bibliothèque de ressources à une autre. Jusqu'ici il fallait
 * dupliquer la formation pour exprimer ça.
 *
 * Fonction pure et exportée pour que la route API, l'écran de réglage et
 * ce fichier tombent tous les trois sur la même réponse.
 */
export function resolveRegleParcours(valeurSession: boolean | null | undefined, valeurFormation: boolean): boolean {
  return valeurSession ?? valeurFormation;
}

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
  const [regles, modules, progressList, quizAttempts] = await Promise.all([
    // La règle se lit sur le dossier plutôt que sur la formation seule : le
    // dossier porte sa session, et c'est elle qui peut surcharger. Passer
    // par le dossier évite d'ajouter un `sessionId` à la signature — les
    // quatre appelants (progression vidéo, tentative de quiz, page
    // apprenant, auto-réparation) n'ont pas tous la session sous la main.
    prisma.dossier.findUnique({
      where: { id: params.dossierId },
      select: { session: { select: { sequentialUnlock: true, course: { select: { sequentialUnlock: true } } } } },
    }),
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

  // Accès libre (la session, ou à défaut la formation, à false) : il n'y a
  // pas de « suivant », tout s'ouvre. On crée d'un coup les lignes de
  // progression manquantes plutôt que de traiter le déverrouillage comme un
  // cas particulier partout en aval — getModuleState, le calcul
  // d'avancement et l'attestation continuent de lire exactement la même
  // chose. Le garde-fou du dessus reste : sans aucune ligne, le dossier
  // n'a jamais eu d'accès, et l'assignation explicite doit passer d'abord.
  const sequentiel = regles
    ? resolveRegleParcours(regles.session.sequentialUnlock, regles.session.course.sequentialUnlock)
    : true;
  if (!sequentiel) {
    const àOuvrir = modules.filter((m) => !progressByModule.has(m.id));
    if (àOuvrir.length === 0) return false;
    await prisma.elearningProgress.createMany({
      data: àOuvrir.map((m) => ({
        dossierId: params.dossierId,
        moduleId: m.id,
        assignedByName: "Accès libre",
      })),
    });
    return true;
  }

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
