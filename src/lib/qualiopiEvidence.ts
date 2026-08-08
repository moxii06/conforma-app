import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { coursMisses } from "@/lib/courseCompleteness";

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
    publicCoursePages,
    qualificationDocuments,
    rnqEngagements,
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
    prisma.course.count({ where: { organizationId, isPublic: true, archivedAt: null } }),
    // Proof of indicator 17 (qualification of internal AND external staff) —
    // the same Document model tracks both (userId for a staff member,
    // subcontractorId for an external one), category cv/diploma either way.
    prisma.document.count({ where: { organizationId, category: { in: ["cv", "diploma"] }, OR: [{ userId: { not: null } }, { subcontractorId: { not: null } }] } }),
    prisma.document.count({ where: { organizationId, category: "rnq_engagement", subcontractorId: { not: null } } }),
  ]);

  const watchCount = (type: string) => watchByType.find((w: { watchType: string }) => w.watchType === type)?._count ?? 0;

  const map = new Map<number, AutoEvidence[]>();
  const add = (indicator: number, label: string, count: number, href: string) => {
    if (count <= 0) return;
    const list = map.get(indicator) ?? [];
    list.push({ label, count, href });
    map.set(indicator, list);
  };

  add(1, "fiche(s) formation publique(s) en ligne (10 items obligatoires)", publicCoursePages, "/formations");
  add(1, "indicateur(s) de résultats publié(s)", publishedResultIndicators, "/qualiopi?tab=resultats");
  add(2, "indicateur(s) de résultats calculé(s) avec méthode", resultIndicators, "/qualiopi?tab=resultats");
  add(4, "recueil(s) des besoins complété(s)", needsAssessmentsCompleted, "/dossiers");
  add(8, "test(s) de positionnement à l'entrée complété(s)", positioningCompleted, "/dossiers");
  add(11, "module(s) terminé(s) par des apprenants (suivi réel)", modulesCompleted, "/formations");
  add(11, "quiz réussi(s) (correction serveur)", quizPassed, "/formations");
  add(11, "attestation(s) de réussite émise(s)", certificatesIssued, "/documents");
  add(12, "relance(s) automatique(s) envoyée(s) et horodatée(s)", systemOutreach, "/automatisations");
  add(12, "règle(s) de relance active(s)", activeRules, "/automatisations");
  add(17, "pièce(s) CV/diplôme suivie(s) (formateurs internes et externes)", qualificationDocuments, "/team");
  add(19, "module(s) e-learning mis à disposition", moduleCount, "/formations");
  add(19, "document(s) complémentaire(s) fournis aux apprenants", attachmentCount, "/formations");
  add(21, "évaluation(s) d'intervenant datée(s) sur les 12 derniers mois", intervenantEvaluations, "/team?tab=evaluations");
  add(22, "évaluation(s) avec plan de développement des compétences", intervenantEvaluations, "/team?tab=evaluations");
  add(23, "élément(s) de veille légale et réglementaire", watchCount("legal"), "/qualiopi?tab=veille");
  add(24, "élément(s) de veille emplois, métiers et compétences", watchCount("metiers_competences"), "/qualiopi?tab=veille");
  add(25, "élément(s) de veille pédagogique et technologique", watchCount("pedagogique_technologique"), "/qualiopi?tab=veille");
  add(26, "référent handicap désigné", org?.referentHandicapUserId ? 1 : 0, "/team");
  add(26, "demande(s) d'aménagement handicap traitée(s) confidentiellement", accommodationRequests, "/team");
  add(27, "sous-traitant(s)/intervenant(s) référencé(s) avec contrats suivis", activeSubcontractors, "/team");
  add(27, "engagement(s) de conformité RNQ signé(s) par un sous-traitant", rnqEngagements, "/team?tab=prestataires");
  add(28, "élément(s) de veille réseaux et partenariats", watchCount("reseaux_partenariats"), "/qualiopi?tab=veille");
  add(30, "questionnaire(s) de satisfaction complété(s)", satisfactionCompleted, "/qualiopi?tab=resultats");
  add(31, "réclamation(s) traitée(s) et résolue(s)", complaintsResolved, "/support");
  add(32, "risque(s)/action(s) au registre d'amélioration continue", qualityRisks, "/qualiopi?tab=amelioration-continue");
  add(32, "non-conformité(s) d'audit avec action corrective acceptée", auditFindingsHandled, "/qualiopi?tab=audits");

  return map;
}

// ---------------------------------------------------------------------------
// Les trous de preuve — le symétrique exact de getAutomaticEvidence
// ---------------------------------------------------------------------------

/**
 * Un manque nommé sur un indicateur, avec l'écran qui permet de le combler.
 *
 * INVARIANT à respecter pour tout nouveau trou : un trou ne se déclenche que
 * s'il désigne une population qui EXISTE déjà (des fiches en ligne mais
 * incomplètes, des questionnaires envoyés sans retour, des intervenants sans
 * pièces…). C'est ce qui rend la règle « un trou ⇒ orange » honnête : orange
 * veut dire « quelque chose existe mais est incomplet », jamais « il n'y a
 * rien ». Un indicateur sur lequel rien n'existe reste rouge, et c'est une
 * information différente pour l'organisme comme pour l'auditeur.
 */
export type EvidenceGap = {
  /** Ce qui manque, formulé comme l'auditeur le constatera. */
  label: string;
  /** L'écran de Jalon où le corriger — jamais une page d'explication. */
  href: string;
  /** Le lien d'action : un verbe à l'impératif, jamais « en savoir plus ». */
  actionLabel: string;
  /**
   * Écart déjà relevé par un certificateur et toujours ouvert. Ce n'est plus
   * une hypothèse de trou déduite des données, c'est un constat écrit qui
   * sera revérifié en priorité au prochain audit : il passe donc devant tout
   * le reste du plan d'action.
   */
  critical?: boolean;
};

/** Fenêtre au-delà de laquelle une évaluation d'intervenant n'est plus « récente ». */
const EVALUATION_FRESHNESS_MS = 366 * 24 * 60 * 60 * 1000;

/** Les quatre axes de veille du critère 6 et l'indicateur qui les porte. */
const WATCH_TYPE_TO_INDICATOR: Record<string, number> = {
  legal: 23,
  metiers_competences: 24,
  pedagogique_technologique: 25,
  reseaux_partenariats: 28,
};

export async function getEvidenceGaps(organizationId: string): Promise<Map<number, EvidenceGap[]>> {
  const now = new Date();
  const freshnessFloor = new Date(now.getTime() - EVALUATION_FRESHNESS_MS);

  const [
    org,
    publicCourses,
    activeCourseCount,
    resultIndicatorsByPublication,
    needsAssessmentsByStatus,
    satisfactionByStatus,
    positioningByStatus,
    rulesByActivity,
    trainersWithoutQualification,
    activeSubcontractors,
    evaluationsTotal,
    evaluationsRecent,
    watchByTypeAndStatus,
    accommodationsByStatus,
    openComplaints,
    openFindings,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { referentHandicapUserId: true } }),
    // Seules les fiches RÉELLEMENT publiées peuvent être « publiées mais
    // incomplètes ». Sélection étroite : c'est le seul findMany de la
    // fonction, tout le reste sont des comptages.
    prisma.course.findMany({
      where: { organizationId, isPublic: true, archivedAt: null },
      select: {
        id: true,
        title: true,
        durationHours: true,
        priceCents: true,
        prerequisites: true,
        accessModalities: true,
        accessDelay: true,
        teachingMethods: true,
        evaluationModalities: true,
      },
      orderBy: { title: "asc" },
    }),
    prisma.course.count({ where: { organizationId, archivedAt: null } }),
    prisma.resultIndicator.groupBy({ by: ["published"], where: { organizationId }, _count: true }),
    prisma.needsAssessmentRequest.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
    prisma.satisfactionSurveyResponse.groupBy({
      by: ["status"],
      where: { organizationId, survey: { kind: { in: ["hot", "cold"] } } },
      _count: true,
    }),
    prisma.satisfactionSurveyResponse.groupBy({
      by: ["status"],
      where: { organizationId, survey: { kind: "positioning" } },
      _count: true,
    }),
    prisma.automationRule.groupBy({ by: ["active"], where: { organizationId }, _count: true }),
    // Un sous-traitant à qui on a ouvert un accès EST un User TRAINER (voir
    // Subcontractor.linkedUserId) : sans l'exclure, ses pièces manquantes
    // seraient comptées deux fois, une fois côté membres et une fois côté
    // prestataires.
    prisma.user.count({
      where: {
        organizationId,
        status: { not: "disabled" },
        OR: [{ role: Role.TRAINER }, { additionalRoles: { has: Role.TRAINER } }],
        subcontractorRecord: { is: null },
        documents: { none: { organizationId, category: { in: ["cv", "diploma"] } } },
      },
    }),
    prisma.subcontractor.findMany({
      where: { organizationId, status: "active" },
      select: {
        id: true,
        contractEndDate: true,
        documents: {
          where: { organizationId, category: { in: ["cv", "diploma", "rnq_engagement"] } },
          select: { category: true },
        },
      },
    }),
    prisma.intervenantEvaluation.count({ where: { organizationId } }),
    prisma.intervenantEvaluation.count({ where: { organizationId, evaluatedAt: { gte: freshnessFloor } } }),
    prisma.regulatoryWatch.groupBy({ by: ["watchType", "status"], where: { organizationId }, _count: true }),
    prisma.accommodationRequest.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
    prisma.complaint.count({
      where: { organizationId, status: { in: ["open", "investigating"] }, archivedAt: null },
    }),
    // Un écart de certification non soldé est le seul « trou » que
    // l'organisme n'a pas déduit lui-même : quelqu'un l'a écrit sur un
    // rapport d'audit. Il porte sur SON indicateur, pas seulement sur le 32.
    prisma.qualiopiAuditFinding.findMany({
      where: { audit: { organizationId }, status: { not: "soldee" } },
      select: { indicatorNumber: true, severity: true, status: true, audit: { select: { auditDate: true } } },
      orderBy: { audit: { auditDate: "desc" } },
    }),
  ]);

  const map = new Map<number, EvidenceGap[]>();
  const add = (indicator: number, gap: EvidenceGap) => {
    const list = map.get(indicator) ?? [];
    list.push(gap);
    map.set(indicator, list);
  };

  const sumBy = <T>(rows: T[], keep: (row: T) => boolean, count: (row: T) => number) =>
    rows.filter(keep).reduce((total, row) => total + count(row), 0);

  // --- Critère 1 : information du public -----------------------------------
  const incompletePublicCourses = publicCourses.filter((c) =>
    coursMisses(c).some((groupe) => groupe.blocage === "publication")
  );
  if (activeCourseCount > 0 && publicCourses.length === 0) {
    add(1, {
      label: `${activeCourseCount} formation(s) au catalogue, aucune fiche publique en ligne`,
      href: "/formations",
      actionLabel: "Publier une fiche →",
    });
  }
  if (incompletePublicCourses.length > 0) {
    const seule = incompletePublicCourses.length === 1 ? incompletePublicCourses[0] : null;
    add(1, {
      // Une seule fiche fautive : on la nomme et on ouvre directement le bon
      // onglet de la bonne formation, où le bandeau « informations
      // manquantes » désigne déjà le champ. Plusieurs : le catalogue.
      label: seule
        ? `Fiche publique « ${seule.title} » incomplète sur les items obligatoires (prérequis, modalités et délai d'accès, méthodes mobilisées, modalités d'évaluation)`
        : `${incompletePublicCourses.length} fiches publiques incomplètes sur les items obligatoires (prérequis, modalités et délai d'accès, méthodes mobilisées, modalités d'évaluation)`,
      href: seule ? `/formations/${seule.id}?tab=resume` : "/formations",
      actionLabel: "Compléter la fiche →",
    });
  }

  // --- Indicateur 2 : diffusion des indicateurs de résultats ---------------
  const resultTotal = sumBy(resultIndicatorsByPublication, () => true, (r) => r._count);
  const resultPublished = sumBy(resultIndicatorsByPublication, (r) => r.published, (r) => r._count);
  if (resultTotal > 0 && resultPublished === 0) {
    add(2, {
      label: `${resultTotal} indicateur(s) de résultats calculé(s) avec leur méthode, aucun publié sur vos fiches publiques`,
      href: "/qualiopi?tab=resultats",
      actionLabel: "Publier maintenant →",
    });
  }

  // --- Indicateurs 4 et 8 : analyse du besoin et positionnement ------------
  const needsSent = sumBy(needsAssessmentsByStatus, (r) => r.status === "sent", (r) => r._count);
  const needsCompleted = sumBy(needsAssessmentsByStatus, (r) => r.status === "completed", (r) => r._count);
  if (needsSent > 0 && needsCompleted === 0) {
    add(4, {
      label: `${needsSent} recueil(s) des besoins envoyé(s), aucun retour à exploiter`,
      href: "/dossiers",
      actionLabel: "Relancer les destinataires →",
    });
  }
  const positioningSent = sumBy(positioningByStatus, (r) => r.status === "sent", (r) => r._count);
  const positioningCompleted = sumBy(positioningByStatus, (r) => r.status === "completed", (r) => r._count);
  if (positioningSent > 0 && positioningCompleted === 0) {
    add(8, {
      label: `${positioningSent} test(s) de positionnement envoyé(s), aucun complété`,
      href: "/dossiers",
      actionLabel: "Relancer les apprenants →",
    });
  }

  // --- Indicateur 12 : suivi et relances -----------------------------------
  const rulesTotal = sumBy(rulesByActivity, () => true, (r) => r._count);
  const rulesActive = sumBy(rulesByActivity, (r) => r.active, (r) => r._count);
  if (rulesTotal > 0 && rulesActive === 0) {
    add(12, {
      label: `${rulesTotal} règle(s) de relance créée(s), toutes désactivées — aucune trace horodatée ne sera produite`,
      href: "/automatisations",
      actionLabel: "Réactiver une règle →",
    });
  }

  // --- Indicateurs 17, 21 et 27 : personnels et sous-traitance -------------
  const subcontractorsWithoutQualification = activeSubcontractors.filter(
    (s) => !s.documents.some((d) => d.category === "cv" || d.category === "diploma")
  ).length;
  const subcontractorsWithRnq = activeSubcontractors.filter((s) =>
    s.documents.some((d) => d.category === "rnq_engagement")
  ).length;
  const expiredContracts = activeSubcontractors.filter(
    (s) => s.contractEndDate != null && s.contractEndDate < now
  ).length;

  if (trainersWithoutQualification > 0) {
    add(17, {
      label: `${trainersWithoutQualification} formateur(s) interne(s) sans CV ni diplôme au dossier`,
      href: "/team",
      actionLabel: "Ajouter les pièces →",
    });
  }
  if (subcontractorsWithoutQualification > 0) {
    add(17, {
      label: `${subcontractorsWithoutQualification} intervenant(s) externe(s) actif(s) sans CV ni diplôme au dossier`,
      href: "/team?tab=prestataires",
      actionLabel: "Ajouter les pièces →",
    });
  }
  if (evaluationsTotal > 0 && evaluationsRecent === 0) {
    add(21, {
      label: `${evaluationsTotal} évaluation(s) d'intervenant enregistrée(s), toutes antérieures à 12 mois`,
      href: "/team?tab=evaluations",
      actionLabel: "Évaluer à nouveau →",
    });
  }
  if (activeSubcontractors.length > 0 && subcontractorsWithRnq === 0) {
    add(27, {
      label: `${activeSubcontractors.length} sous-traitant(s) actif(s), aucun engagement de conformité au RNQ signé`,
      href: "/team?tab=prestataires",
      actionLabel: "Envoyer l'engagement →",
    });
  }
  if (expiredContracts > 0) {
    add(27, {
      label: `${expiredContracts} contrat(s) de sous-traitance échu(s) alors que l'intervenant est toujours actif`,
      href: "/team?tab=prestataires",
      actionLabel: "Renouveler le contrat →",
    });
  }

  // --- Critère 6 : la veille collectée mais jamais exploitée ---------------
  // Le piège classique de l'audit : l'indicateur ne demande pas d'avoir
  // consulté des sources, il demande de prouver ce qu'on en a FAIT.
  for (const [watchType, indicator] of Object.entries(WATCH_TYPE_TO_INDICATOR)) {
    const rows = watchByTypeAndStatus.filter((w) => w.watchType === watchType);
    const total = sumBy(rows, () => true, (r) => r._count);
    const exploited = sumBy(rows, (r) => r.status === "exploited", (r) => r._count);
    if (total > 0 && exploited === 0) {
      add(indicator, {
        label: `${total} élément(s) de veille collecté(s), aucun tracé jusqu'à son exploitation (décision + preuve)`,
        href: "/qualiopi?tab=veille",
        actionLabel: "Tracer l'exploitation →",
      });
    }
  }

  // --- Indicateur 26 : handicap --------------------------------------------
  const accommodationsTotal = sumBy(accommodationsByStatus, () => true, (r) => r._count);
  const accommodationsPending = sumBy(accommodationsByStatus, (r) => r.status === "pending", (r) => r._count);
  // Conditionné à l'existence de demandes : sans aucune activité handicap,
  // l'indicateur est rouge (rien détecté), pas orange — voir l'invariant en
  // tête de EvidenceGap.
  if (accommodationsTotal > 0 && !org?.referentHandicapUserId) {
    add(26, {
      label: "Des demandes d'aménagement sont suivies mais aucun référent handicap n'est désigné",
      href: "/team",
      actionLabel: "Désigner un référent →",
    });
  }
  if (accommodationsPending > 0) {
    add(26, {
      label: `${accommodationsPending} demande(s) d'aménagement en attente de réponse`,
      href: "/dossiers",
      actionLabel: "Traiter la demande →",
    });
  }

  // --- Indicateurs 30 et 31 : appréciations et réclamations ----------------
  const satisfactionSent = sumBy(satisfactionByStatus, (r) => r.status === "sent", (r) => r._count);
  const satisfactionCompleted = sumBy(satisfactionByStatus, (r) => r.status === "completed", (r) => r._count);
  if (satisfactionSent > 0 && satisfactionCompleted === 0) {
    add(30, {
      label: `${satisfactionSent} questionnaire(s) de satisfaction envoyé(s), aucun retour reçu`,
      href: "/dossiers",
      actionLabel: "Relancer les apprenants →",
    });
  }
  if (openComplaints > 0) {
    add(31, {
      label: `${openComplaints} réclamation(s) en cours, sans résolution tracée`,
      href: "/support",
      actionLabel: "Traiter la réclamation →",
    });
  }

  // --- Les écarts d'audit, sur leur propre indicateur ----------------------
  for (const finding of openFindings) {
    const auditDate = finding.audit.auditDate.toLocaleDateString("fr-FR");
    add(finding.indicatorNumber, {
      label:
        finding.status === "levee"
          ? `Non-conformité ${finding.severity} de l'audit du ${auditDate} : action corrective acceptée, à solder au prochain audit`
          : `Non-conformité ${finding.severity} relevée à l'audit du ${auditDate}, sans action corrective acceptée`,
      href: "/qualiopi?tab=audits",
      actionLabel: finding.status === "levee" ? "Préparer la preuve →" : "Traiter cette non-conformité →",
      critical: finding.status !== "levee",
    });
  }

  // Un écart de certificateur se lit avant les trous déduits par Jalon.
  for (const [indicator, gaps] of map) {
    map.set(indicator, [...gaps].sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical))));
  }

  return map;
}

// ---------------------------------------------------------------------------
// Le feu tricolore, partagé par le plan d'action et le détail par critère
// ---------------------------------------------------------------------------

export type IndicatorStatus = "conforme" | "a_verifier" | "non_conforme";

export type IndicatorDiagnosis = {
  number: number;
  criterionNumber: number;
  label: string;
  scope: string;
  status: IndicatorStatus;
  /** La case « dossier prêt » de l'onglet Préparation audit (AuditChecklistItem.gathered). */
  gathered: boolean;
  auto: AutoEvidence[];
  gaps: EvidenceGap[];
};

/**
 * L'ordre des trois tests est le cœur de l'écran, et il n'est pas
 * interchangeable.
 *
 * La case cochée passe DEVANT les trous détectés : c'est le jugement
 * explicite de l'organisme sur son propre dossier (« j'ai regardé mes
 * pièces, c'est prêt »), et une heuristique n'a pas à contredire quelqu'un
 * qui a ouvert le classeur. C'est aussi la seule façon de faire taire une
 * alerte qu'on juge non pertinente.
 *
 * En revanche un trou détecté passe devant l'activité tracée. Sans cette
 * règle, un organisme dont une seule fiche formation est en ligne verrait
 * l'indicateur 1 au vert pendant que ses trois autres fiches sont
 * incomplètes — c'est exactement comme ça qu'on arrive à un audit en se
 * croyant couvert.
 */
export function resolveIndicatorStatus(input: {
  gathered: boolean;
  autoCount: number;
  gapCount: number;
}): IndicatorStatus {
  if (input.gathered) return "conforme";
  if (input.gapCount > 0) return "a_verifier";
  if (input.autoCount > 0) return "conforme";
  return "non_conforme";
}

export function diagnoseIndicators(
  indicators: { number: number; criterionNumber: number; label: string; scope: string }[],
  gatheredNumbers: Set<number>,
  auto: Map<number, AutoEvidence[]>,
  gaps: Map<number, EvidenceGap[]>
): IndicatorDiagnosis[] {
  return indicators.map((ind) => {
    const indAuto = auto.get(ind.number) ?? [];
    const indGaps = gaps.get(ind.number) ?? [];
    const gathered = gatheredNumbers.has(ind.number);
    return {
      number: ind.number,
      criterionNumber: ind.criterionNumber,
      label: ind.label,
      scope: ind.scope,
      gathered,
      auto: indAuto,
      gaps: indGaps,
      status: resolveIndicatorStatus({ gathered, autoCount: indAuto.length, gapCount: indGaps.length }),
    };
  });
}

export type StatusCensus = { conforme: number; a_verifier: number; non_conforme: number; total: number };

export function censusByStatus(diagnoses: IndicatorDiagnosis[]): StatusCensus {
  const census: StatusCensus = { conforme: 0, a_verifier: 0, non_conforme: 0, total: diagnoses.length };
  for (const d of diagnoses) census[d.status] += 1;
  return census;
}

/**
 * L'ordre du plan d'action.
 *
 * La date du prochain audit ne discrimine RIEN ici : elle est unique pour
 * tout l'organisme, donc elle ne peut pas classer un indicateur avant un
 * autre. Elle règle l'urgence du plan dans son ensemble (le bandeau
 * « audit dans N jours »), pas l'ordre de ses lignes. Ce qui distingue
 * réellement deux lignes, c'est ce qu'un auditeur regardera en premier :
 * l'écart qu'il a lui-même écrit au dernier audit, puis ce sur quoi il n'y
 * a rien du tout, puis ce qui est incomplet.
 */
export function sortByUrgency(diagnoses: IndicatorDiagnosis[]): IndicatorDiagnosis[] {
  const rank = (d: IndicatorDiagnosis) => {
    if (d.gaps.some((g) => g.critical)) return 0;
    if (d.status === "non_conforme") return 1;
    return 2;
  };
  return [...diagnoses].sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}
