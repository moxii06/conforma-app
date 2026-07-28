import { prisma } from "@/lib/prisma";

// "Activité tracée" per Qualiopi indicator — the automatic counterpart to
// the hand-declared QualiopiIndicatorEvidence rows. Every entry is a COUNT
// of rows that already exist because staff/learners did real work (a
// completed module, a resolved complaint, a watch item…): nothing here is
// generated for the sake of the audit, which is exactly the boundary the
// product must keep (facilitate proof, never fabricate it). Mappings are
// deliberately conservative — an indicator with no solid trace simply gets
// no entry, and the UI presents these as "matière première de preuve",
// whose relevance stays for the OF and the auditor to judge.
export type AutoEvidence = { label: string; count: number; href: string };

export async function getAutomaticEvidence(organizationId: string): Promise<Map<number, AutoEvidence[]>> {
  const [
    resultIndicators,
    publishedResultIndicators,
    needsAssessmentsCompleted,
    modulesCompleted,
    quizPassed,
    certificatesIssued,
    systemOutreach,
    activeRules,
    moduleCount,
    attachmentCount,
    org,
    accommodationRequests,
    watchByType,
    activeSubcontractors,
    satisfactionCompleted,
    positioningCompleted,
    complaintsResolved,
    qualityRisks,
    auditFindingsHandled,
    intervenantEvaluations,
  ] = await Promise.all([
    prisma.resultIndicator.count({ where: { organizationId } }),
    prisma.resultIndicator.count({ where: { organizationId, published: true } }),
    prisma.needsAssessmentRequest.count({ where: { organizationId, status: "completed" } }),
    prisma.elearningProgress.count({ where: { module: { course: { organizationId } }, percentComplete: { gte: 100 } } }),
    prisma.quizAttempt.count({ where: { dossier: { organizationId }, passed: true } }),
    prisma.document.count({ where: { organizationId, category: "results_summary" } }),
    prisma.clientOutreach.count({ where: { organizationId, sentByUserId: "system" } }),
    prisma.automationRule.count({ where: { organizationId, active: true } }),
    prisma.elearningModule.count({ where: { course: { organizationId } } }),
    prisma.elearningModuleAttachment.count({ where: { module: { course: { organizationId } } } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { referentHandicapUserId: true } }),
    prisma.accommodationRequest.count({ where: { organizationId } }),
    prisma.regulatoryWatch.groupBy({ by: ["watchType"], where: { organizationId }, _count: true }),
    prisma.subcontractor.count({ where: { organizationId, status: "active" } }),
    prisma.satisfactionSurveyResponse.count({ where: { organizationId, status: "completed", survey: { kind: { in: ["hot", "cold"] } } } }),
    prisma.satisfactionSurveyResponse.count({ where: { organizationId, status: "completed", survey: { kind: "positioning" } } }),
    prisma.complaint.count({ where: { organizationId, status: "resolved" } }),
    prisma.qualityRisk.count({ where: { organizationId } }),
    prisma.qualiopiAuditFinding.count({ where: { audit: { organizationId }, status: { in: ["levee", "soldee"] } } }),
    prisma.intervenantEvaluation.count({
      where: { organizationId, evaluatedAt: { gte: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const watchCount = (type: string) => watchByType.find((w: { watchType: string }) => w.watchType === type)?._count ?? 0;

  const map = new Map<number, AutoEvidence[]>();
  const add = (indicator: number, label: string, count: number, href: string) => {
    if (count <= 0) return;
    const list = map.get(indicator) ?? [];
    list.push({ label, count, href });
    map.set(indicator, list);
  };

  add(1, "indicateur(s) de résultats publié(s)", publishedResultIndicators, "/qualiopi?tab=resultats");
  add(2, "indicateur(s) de résultats calculé(s) avec méthode", resultIndicators, "/qualiopi?tab=resultats");
  add(4, "recueil(s) des besoins complété(s)", needsAssessmentsCompleted, "/dossiers");
  add(8, "test(s) de positionnement à l'entrée complété(s)", positioningCompleted, "/dossiers");
  add(11, "module(s) terminé(s) par des apprenants (suivi réel)", modulesCompleted, "/formations");
  add(11, "quiz réussi(s) (correction serveur)", quizPassed, "/formations");
  add(11, "attestation(s) de réussite émise(s)", certificatesIssued, "/documents");
  add(12, "relance(s) automatique(s) envoyée(s) et horodatée(s)", systemOutreach, "/automatisations");
  add(12, "règle(s) de relance active(s)", activeRules, "/automatisations");
  add(17, "module(s) e-learning mis à disposition", moduleCount, "/formations");
  add(19, "document(s) complémentaire(s) fournis aux apprenants", attachmentCount, "/formations");
  add(20, "référent handicap désigné", org?.referentHandicapUserId ? 1 : 0, "/team");
  add(21, "évaluation(s) d'intervenant datée(s) sur les 12 derniers mois", intervenantEvaluations, "/team?tab=evaluations");
  add(22, "évaluation(s) avec plan de développement des compétences", intervenantEvaluations, "/team?tab=evaluations");
  add(23, "élément(s) de veille légale et réglementaire", watchCount("legal"), "/qualiopi?tab=veille");
  add(24, "élément(s) de veille emplois, métiers et compétences", watchCount("metiers_competences"), "/qualiopi?tab=veille");
  add(25, "élément(s) de veille pédagogique et technologique", watchCount("pedagogique_technologique"), "/qualiopi?tab=veille");
  add(25, "élément(s) de veille réseaux et partenariats", watchCount("reseaux_partenariats"), "/qualiopi?tab=veille");
  add(26, "demande(s) d'aménagement handicap traitée(s) confidentiellement", accommodationRequests, "/team");
  add(27, "sous-traitant(s)/intervenant(s) référencé(s) avec contrats suivis", activeSubcontractors, "/team");
  add(30, "questionnaire(s) de satisfaction complété(s)", satisfactionCompleted, "/qualiopi?tab=resultats");
  add(31, "réclamation(s) traitée(s) et résolue(s)", complaintsResolved, "/support");
  add(32, "risque(s)/action(s) au registre d'amélioration continue", qualityRisks, "/qualiopi?tab=amelioration-continue");
  add(32, "non-conformité(s) d'audit avec action corrective acceptée", auditFindingsHandled, "/qualiopi?tab=audits");

  return map;
}
