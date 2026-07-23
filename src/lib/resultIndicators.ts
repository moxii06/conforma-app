import { prisma } from "@/lib/prisma";

export const COMPUTABLE_METRICS = {
  elearning_completion: {
    label: "Taux de complétion e-learning",
    definition:
      "Part des modules e-learning assignés dans la période dont l'apprenant a atteint 100% de progression.",
    formula: "Modules assignés atteignant 100% de progression ÷ modules assignés dans la période",
  },
  hot_evaluation_rate: {
    label: "Taux de réalisation de l'évaluation à chaud",
    definition:
      "Part des dossiers de la période ayant complété leur évaluation à chaud en fin de formation.",
    formula: "Dossiers avec évaluation à chaud réalisée ÷ dossiers de la période",
  },
} as const;

export type ComputableMetric = keyof typeof COMPUTABLE_METRICS;

export async function computeIndicator(params: {
  organizationId: string;
  metric: ComputableMetric;
  courseId?: string | null;
  periodStart: Date;
  periodEnd: Date;
}) {
  const { organizationId, metric, courseId, periodStart, periodEnd } = params;

  if (metric === "elearning_completion") {
    const progress = await prisma.elearningProgress.findMany({
      where: {
        module: { course: { organizationId, ...(courseId ? { id: courseId } : {}) } },
        assignedAt: { gte: periodStart, lte: periodEnd },
      },
      select: { percentComplete: true },
    });
    const totalPopulation = progress.length;
    const respondents = progress.filter((p) => p.percentComplete >= 100).length;
    return { totalPopulation, respondents };
  }

  // hot_evaluation_rate
  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId,
      createdAt: { gte: periodStart, lte: periodEnd },
      ...(courseId ? { session: { courseId } } : {}),
    },
    select: { evaluationHotDone: true },
  });
  const totalPopulation = dossiers.length;
  const respondents = dossiers.filter((d) => d.evaluationHotDone).length;
  return { totalPopulation, respondents };
}
