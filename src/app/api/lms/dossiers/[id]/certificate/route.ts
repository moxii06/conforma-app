import { NextResponse } from "next/server";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Real completion check, not a trusted client flag — recomputes the same
// per-module "completed" state the learner portal displays (video/document
// percentComplete >= 100, quiz has a passed attempt) rather than accepting
// a "yes I finished" claim, and only issues the certificate if every module
// in the course actually clears that bar. Idempotent: re-generating returns
// the existing certificate document instead of piling up duplicates.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      contact: true,
      session: {
        include: {
          course: { include: { elearningModules: { include: { quiz: true } } } },
          days: { orderBy: { order: "asc" } },
        },
      },
      elearningProgress: true,
      quizAttempts: true,
      attendanceEntries: true,
    },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isOwnDossier && !isStaff) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const modules = dossier.session.course.elearningModules;
  const days = dossier.session.days;

  // Two ways to earn an attestation, because a training organisation has two
  // ways to actually deliver. This route used to serve only the first and
  // 400'd on the second — which meant an OF running purely in-person could
  // never issue one, though article L.6353-1 requires it of every action.
  const isElearning = modules.length > 0;
  if (!isElearning && days.length === 0) {
    return NextResponse.json(
      { error: "Aucun module e-learning ni journée d'émargement — impossible d'attester d'une réalisation." },
      { status: 400 },
    );
  }

  // Hours the learner was actually present for, per the signed attendance.
  // This is what the attestation states and what a funder checks — not the
  // planned duration, which they may not have attended in full.
  const hoursByDay = new Map(days.map((d) => [d.id, d]));
  const attendedHours = dossier.attendanceEntries.reduce((sum, e) => {
    const day = hoursByDay.get(e.sessionDayId);
    if (!day) return sum;
    return sum + ((e.halfDay === "MORNING" ? day.morningHours : day.afternoonHours) ?? 0);
  }, 0);
  const plannedHours = days.reduce((s, d) => s + (d.morningHours ?? 0) + (d.afternoonHours ?? 0), 0);

  if (isElearning) {
    const progressByModule = new Map(dossier.elearningProgress.map((p) => [p.moduleId, p]));
    const allCompleted = modules.every((m) => {
      if (m.type === "quiz") {
        if (!m.quiz) return false;
        return dossier.quizAttempts.some((a) => a.quizId === m.quiz!.id && a.passed);
      }
      return (progressByModule.get(m.id)?.percentComplete ?? 0) >= 100;
    });
    if (!allCompleted) {
      return NextResponse.json({ error: "Tous les modules ne sont pas encore terminés." }, { status: 400 });
    }
  } else if (dossier.attendanceEntries.length === 0) {
    // Attesting that someone attended a session they never signed for would
    // be manufacturing the very proof this product exists to make honest.
    return NextResponse.json(
      { error: "Aucun émargement enregistré pour cet apprenant — faites d'abord signer la feuille de présence." },
      { status: 400 },
    );
  }

  const existing = await prisma.document.findFirst({
    where: { dossierId: dossier.id, templateOrigin: "lms_certificate" },
  });
  if (existing) return NextResponse.json(existing);

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const courseTitle = dossier.session.course.title;
  const learnerName = `${dossier.contact.firstName} ${dossier.contact.lastName}`;
  const validityMonths = dossier.session.course.certificateValidityMonths;
  const expiresAt = validityMonths ? addMonths(new Date(), validityMonths) : null;

  const course = dossier.session.course;
  // Article L.6353-1 requires the attestation to state the objectives, the
  // nature and the duration of the action, and the outcome of the assessment.
  // The previous version carried none of the four.
  const legalBlock =
    (course.objectives ? `\nObjectifs de la formation :\n${course.objectives}\n` : "") +
    (course.durationHours != null || plannedHours > 0
      ? `\nDurée de l'action : ${(plannedHours > 0 ? plannedHours : course.durationHours ?? 0).toFixed(1)} heures.\n`
      : "");

  const bodyText = isElearning
    ? `ATTESTATION DE RÉUSSITE\n\n` +
      `${organization.name} atteste que :\n\n` +
      `${learnerName}\n\n` +
      `a suivi et validé l'ensemble des modules e-learning de la formation :\n\n` +
      `« ${courseTitle} »\n` +
      legalBlock +
      `\nModules validés :\n` +
      modules.map((m, i) => `${i + 1}. ${m.title}`).join("\n") +
      `\n\nFait le ${new Date().toLocaleDateString("fr-FR")}.` +
      (expiresAt ? `\n\nCette attestation est valable jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}.` : "")
    : `ATTESTATION DE FIN DE FORMATION\n\n` +
      `(article L.6353-1 du Code du travail)\n\n` +
      `${organization.name} atteste que :\n\n` +
      `${learnerName}\n\n` +
      `a suivi l'action de formation :\n\n` +
      `« ${courseTitle} »\n` +
      legalBlock +
      `\nPrésence effective : ${attendedHours.toFixed(1)} heures sur ${plannedHours.toFixed(1)} heures programmées, ` +
      `attestée par les émargements signés aux dates suivantes :\n` +
      days.map((d) => `— ${d.date.toLocaleDateString("fr-FR")}`).join("\n") +
      (course.evaluationModalities ? `\n\nModalités d'évaluation des acquis :\n${course.evaluationModalities}` : "") +
      `\n\nFait le ${new Date().toLocaleDateString("fr-FR")}.` +
      (expiresAt ? `\n\nCette attestation est valable jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}.` : "");

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: `${isElearning ? "Attestation de réussite" : "Attestation de fin de formation"} — ${courseTitle} — ${learnerName}`,
      bodyText,
      // Same origin marker either way: it's what makes re-generation
      // idempotent above, and a dossier only ever has one of the two.
      templateOrigin: "lms_certificate",
      category: "results_summary",
      expiresAt,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
