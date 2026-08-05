import { addDays, addMonths } from "date-fns";
import { buildCourseProgress } from "./lms";

/**
 * Ce qu'un organisme peut attester, et sous quelle forme.
 *
 * Extrait de la route /api/lms/dossiers/[id]/certificate au moment exact
 * où un second appelant en a eu besoin (l'envoi de l'attestation depuis
 * « À faire »). Deux implémentations auraient fini par ne plus délivrer le
 * même document — et un document d'attestation qui varie selon l'écran d'où
 * on l'a cliqué est une pièce d'audit qui se retourne contre l'OF.
 *
 * Trois formes, jamais mélangées :
 *
 *   success    — e-learning, tous les modules validés.
 *                « ATTESTATION DE RÉUSSITE ».
 *   attendance — pas d'e-learning, présence émargée.
 *                « ATTESTATION DE FIN DE FORMATION » sur les heures signées.
 *   partial    — e-learning, durée d'accès écoulée SANS achèvement.
 *                « ATTESTATION DE FIN DE FORMATION » énonçant l'avancement
 *                réel. C'est le cas que la route refusait jusqu'ici : elle
 *                répondait « tous les modules ne sont pas terminés » et
 *                laissait l'OF sans aucune pièce, alors que l'article
 *                L.6353-1 lui impose d'attester de l'action pour tout
 *                stagiaire — y compris celui qui n'est pas allé au bout.
 *
 * La distinction n'est pas cosmétique : délivrer une « réussite » à
 * quelqu'un qui a validé 2 modules sur 5 est un faux. D'où trois textes
 * distincts plutôt qu'un texte paramétré, et d'où le fait que `partial`
 * énonce toujours le nombre de modules validés.
 */

export type CertificateKind = "success" | "attendance" | "partial";

type CertModule = { id: string; type: string; title: string; quiz: { id: string } | null };
type CertProgress = { moduleId: string; percentComplete: number };
type CertQuizAttempt = { quizId: string; passed: boolean };
type CertDay = { id: string; date: Date; morningHours: number | null; afternoonHours: number | null };
type CertAttendance = { sessionDayId: string; halfDay: string };

export type CertificateInput = {
  organizationName: string;
  learnerName: string;
  course: {
    title: string;
    objectives: string | null;
    durationHours: number | null;
    evaluationModalities: string | null;
    certificateValidityMonths: number | null;
  };
  modules: CertModule[];
  progress: CertProgress[];
  quizAttempts: CertQuizAttempt[];
  days: CertDay[];
  attendanceEntries: CertAttendance[];
  /**
   * Vrai quand la durée d'accès de l'apprenant est écoulée (session en
   * continu). C'est la seule chose qui autorise la forme `partial` : sans
   * échéance dépassée, un parcours inachevé est simplement en cours, et il
   * n'y a rien à attester.
   */
  accessExpired: boolean;
  now: Date;
};

export type CertificateResult =
  | { ok: true; kind: CertificateKind; title: string; bodyText: string; expiresAt: Date | null }
  | { ok: false; reason: string };

const CERT_TITLES: Record<CertificateKind, string> = {
  success: "Attestation de réussite",
  attendance: "Attestation de fin de formation",
  partial: "Attestation de fin de formation",
};

const jour = (d: Date) => d.toLocaleDateString("fr-FR");

/**
 * La durée d'accès de l'apprenant est-elle écoulée ?
 *
 * Même règle exactement que la tâche « durée de formation dépassée » du
 * tableau de bord (dashboardTasks.ts) : elle court à partir du PREMIER
 * ACCÈS réel, pas de l'inscription. Une seule fonction pour les deux, sinon
 * l'écran annoncerait une échéance dépassée pendant que la route refuserait
 * encore de délivrer l'attestation — ou l'inverse.
 *
 * Une session à date fixe n'a pas de durée d'accès : elle renvoie false, et
 * la forme `partial` ne peut donc pas s'y appliquer.
 */
export function isAccessExpired(
  dossier: { accessDurationDays: number | null; firstAccessedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (dossier.accessDurationDays == null || dossier.firstAccessedAt == null) return false;
  return now >= addDays(dossier.firstAccessedAt, dossier.accessDurationDays);
}

export function buildCertificate(input: CertificateInput): CertificateResult {
  const { modules, days, course, organizationName, learnerName, now } = input;
  const isElearning = modules.length > 0;

  // Deux façons de délivrer, donc deux façons de prouver. Ni l'une ni
  // l'autre : il n'y a rien sur quoi asseoir une attestation.
  if (!isElearning && days.length === 0) {
    return {
      ok: false,
      reason: "Aucun module e-learning ni journée d'émargement — impossible d'attester d'une réalisation.",
    };
  }

  const { completedCount, total, allCompleted, states } = buildCourseProgress(
    modules,
    input.progress,
    input.quizAttempts,
  );

  let kind: CertificateKind;
  if (isElearning) {
    if (allCompleted) {
      kind = "success";
    } else if (input.accessExpired) {
      kind = "partial";
    } else {
      return { ok: false, reason: "Tous les modules ne sont pas encore terminés." };
    }
  } else if (input.attendanceEntries.length === 0) {
    // Attester d'une présence que personne n'a signée reviendrait à
    // fabriquer la preuve même que ce produit existe pour rendre honnête.
    return {
      ok: false,
      reason: "Aucun émargement enregistré pour cet apprenant — faites d'abord signer la feuille de présence.",
    };
  } else {
    kind = "attendance";
  }

  // Heures réellement suivies, d'après les émargements signés. C'est ce que
  // l'attestation énonce et ce qu'un financeur contrôle — pas la durée
  // programmée, qu'il n'a peut-être pas suivie en entier.
  const hoursByDay = new Map(days.map((d) => [d.id, d]));
  const attendedHours = input.attendanceEntries.reduce((sum, e) => {
    const day = hoursByDay.get(e.sessionDayId);
    if (!day) return sum;
    return sum + ((e.halfDay === "MORNING" ? day.morningHours : day.afternoonHours) ?? 0);
  }, 0);
  const plannedHours = days.reduce((s, d) => s + (d.morningHours ?? 0) + (d.afternoonHours ?? 0), 0);

  const expiresAt = course.certificateValidityMonths ? addMonths(now, course.certificateValidityMonths) : null;

  // L'article L.6353-1 impose d'énoncer les objectifs, la nature et la
  // durée de l'action, et le résultat de l'évaluation des acquis.
  const legalBlock =
    (course.objectives ? `\nObjectifs de la formation :\n${course.objectives}\n` : "") +
    (course.durationHours != null || plannedHours > 0
      ? `\nDurée de l'action : ${(plannedHours > 0 ? plannedHours : (course.durationHours ?? 0)).toFixed(1)} heures.\n`
      : "");

  const validite = expiresAt ? `\n\nCette attestation est valable jusqu'au ${jour(expiresAt)}.` : "";

  let bodyText: string;
  if (kind === "success") {
    bodyText =
      `ATTESTATION DE RÉUSSITE\n\n` +
      `${organizationName} atteste que :\n\n` +
      `${learnerName}\n\n` +
      `a suivi et validé l'ensemble des modules e-learning de la formation :\n\n` +
      `« ${course.title} »\n` +
      legalBlock +
      `\nModules validés :\n` +
      modules.map((m, i) => `${i + 1}. ${m.title}`).join("\n") +
      `\n\nFait le ${jour(now)}.` +
      validite;
  } else if (kind === "attendance") {
    bodyText =
      `ATTESTATION DE FIN DE FORMATION\n\n` +
      `(article L.6353-1 du Code du travail)\n\n` +
      `${organizationName} atteste que :\n\n` +
      `${learnerName}\n\n` +
      `a suivi l'action de formation :\n\n` +
      `« ${course.title} »\n` +
      legalBlock +
      `\nPrésence effective : ${attendedHours.toFixed(1)} heures sur ${plannedHours.toFixed(1)} heures programmées, ` +
      `attestée par les émargements signés aux dates suivantes :\n` +
      days.map((d) => `— ${jour(d.date)}`).join("\n") +
      (course.evaluationModalities ? `\n\nModalités d'évaluation des acquis :\n${course.evaluationModalities}` : "") +
      `\n\nFait le ${jour(now)}.` +
      validite;
  } else {
    // `partial` : le document dit ce qui a été fait et, en toutes lettres,
    // que le parcours n'a pas été mené à son terme. Un financeur qui le lit
    // doit comprendre en une phrase qu'il ne s'agit pas d'une réussite.
    const valides = modules.filter((m) => states.get(m.id) === "completed");
    const nonValides = modules.filter((m) => states.get(m.id) !== "completed");
    bodyText =
      `ATTESTATION DE FIN DE FORMATION\n\n` +
      `(article L.6353-1 du Code du travail)\n\n` +
      `${organizationName} atteste que :\n\n` +
      `${learnerName}\n\n` +
      `a été inscrit à l'action de formation :\n\n` +
      `« ${course.title} »\n` +
      legalBlock +
      `\nCette attestation est délivrée à l'échéance de la durée d'accès accordée à l'apprenant. ` +
      `Le parcours n'a pas été mené à son terme : ${completedCount} module(s) validé(s) sur ${total}.\n` +
      `\nModules validés :\n` +
      (valides.length > 0 ? valides.map((m, i) => `${i + 1}. ${m.title}`).join("\n") : "Aucun.") +
      `\n\nModules non validés :\n` +
      nonValides.map((m, i) => `${i + 1}. ${m.title}`).join("\n") +
      (course.evaluationModalities ? `\n\nModalités d'évaluation des acquis :\n${course.evaluationModalities}` : "") +
      `\n\nFait le ${jour(now)}.` +
      validite;
  }

  return {
    ok: true,
    kind,
    title: `${CERT_TITLES[kind]} — ${course.title} — ${learnerName}`,
    bodyText,
    expiresAt,
  };
}
