import { buildCourseProgress } from "@/lib/lms";

/**
 * Le relevé d'activité — ce qui tient lieu de feuille d'émargement quand
 * la formation est suivie à distance et en asynchrone.
 *
 * Pourquoi cet objet existe. Une session en continu n'a ni cohorte ni
 * demi-journées : personne ne signe à 9 h et à 14 h, puisque chacun se
 * connecte quand il veut. Signer n'a plus de sens, mais **justifier la
 * réalisation reste obligatoire** — l'article D.6313-3-1 du code du
 * travail fait reposer cette justification sur les activités et les
 * évaluations, pas sur des signatures. Ce sont donc elles qu'il faut
 * pouvoir présenter.
 *
 * Ce que le relevé dit, et ce qu'il ne dit pas. Il dit : combien de
 * modules sont terminés, quand la personne a commencé, quand elle a été
 * active pour la dernière fois, quelles évaluations elle a passées et
 * réussies. Il ne dit PAS combien de fois elle s'est connectée ni combien
 * de temps elle est restée : la base conserve un dernier événement par
 * module, pas un journal horodaté. Un financeur qui exige un relevé de
 * connexions demande autre chose, et le document le mentionne plutôt que
 * de laisser croire le contraire — c'est la même règle que pour le BPF,
 * on ne comble pas un trou par une approximation vraisemblable.
 */

export type ActivityStatus = "not_started" | "in_progress" | "completed";

export type ActivityRow = {
  contactName: string;
  modulesCompleted: number;
  modulesTotal: number;
  percent: number;
  /** Premier accès à l'espace de formation, s'il a eu lieu. */
  firstActivityAt: Date | null;
  /** Événement le plus récent, tous modules et évaluations confondus. */
  lastActivityAt: Date | null;
  quizPassed: number;
  quizTaken: number;
  bestScorePercent: number | null;
  status: ActivityStatus;
  certificateIssuedAt: Date | null;
};

type ModuleInput = { id: string; type: string; quiz: { id: string } | null };
type ProgressInput = { moduleId: string; percentComplete: number; lastEventAt: Date | null };
type QuizAttemptInput = { quizId: string; passed: boolean; scorePercent: number; submittedAt: Date };

export function buildActivityRow(input: {
  contactName: string;
  modules: ModuleInput[];
  progress: ProgressInput[];
  quizAttempts: QuizAttemptInput[];
  firstAccessedAt: Date | null;
  certificateIssuedAt: Date | null;
}): ActivityRow {
  // L'avancement passe par buildCourseProgress, comme le portail apprenant
  // et la délivrance d'attestation : un relevé qui compterait autrement
  // contredirait l'écran que l'apprenant a sous les yeux.
  const { completedCount, total, totalPercent, allCompleted } = buildCourseProgress(
    input.modules,
    input.progress,
    input.quizAttempts
  );

  const horodatages: Date[] = [
    ...input.progress.map((p) => p.lastEventAt).filter((d): d is Date => d !== null),
    ...input.quizAttempts.map((a) => a.submittedAt),
  ];
  const lastActivityAt = horodatages.length > 0 ? new Date(Math.max(...horodatages.map((d) => d.getTime()))) : null;

  // Par ÉVALUATION et non par tentative : repasser trois fois le même quiz
  // ne fait pas trois évaluations, et un relevé qui l'afficherait ainsi
  // flatterait l'assiduité.
  const quizTentes = new Set(input.quizAttempts.map((a) => a.quizId));
  const quizReussis = new Set(input.quizAttempts.filter((a) => a.passed).map((a) => a.quizId));
  const bestScorePercent =
    input.quizAttempts.length > 0 ? Math.max(...input.quizAttempts.map((a) => a.scorePercent)) : null;

  const status: ActivityStatus = allCompleted
    ? "completed"
    : input.firstAccessedAt === null && lastActivityAt === null
      ? "not_started"
      : "in_progress";

  return {
    contactName: input.contactName,
    modulesCompleted: completedCount,
    modulesTotal: total,
    percent: totalPercent,
    firstActivityAt: input.firstAccessedAt,
    lastActivityAt,
    quizPassed: quizReussis.size,
    quizTaken: quizTentes.size,
    bestScorePercent,
    status,
    certificateIssuedAt: input.certificateIssuedAt,
  };
}

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: "Jamais commencé",
  in_progress: "En cours",
  completed: "Terminé",
};

/**
 * La mention qui accompagne le relevé, à l'écran comme dans le PDF.
 *
 * Elle est ici, en un seul endroit, pour que le document exporté et
 * l'écran ne puissent pas raconter deux choses différentes sur la portée
 * de ce qu'ils présentent.
 */
export const ACTIVITY_REPORT_NOTICE =
  "Relevé établi à partir des traces d'activité et des évaluations enregistrées par la plateforme " +
  "(article D.6313-3-1 du code du travail). Il ne constitue pas un relevé de connexions horodaté : " +
  "la plateforme conserve la dernière activité par module, pas le détail de chaque session de travail.";
