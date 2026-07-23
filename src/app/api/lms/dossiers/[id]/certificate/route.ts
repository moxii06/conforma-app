import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Real completion check, not a trusted client flag — recomputes the same
// per-module "completed" state the learner portal displays (video/document
// percentComplete >= 100, quiz has a passed attempt) rather than accepting
// a "yes I finished" claim, and only issues the certificate if every module
// in the course actually clears that bar. Idempotent: re-generating returns
// the existing certificate document instead of piling up duplicates.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      contact: true,
      session: { include: { course: { include: { elearningModules: { include: { quiz: true } } } } } },
      elearningProgress: true,
      quizAttempts: true,
    },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isOwnDossier && !isStaff) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const modules = dossier.session.course.elearningModules;
  if (modules.length === 0) {
    return NextResponse.json({ error: "Cette formation n'a pas de modules e-learning." }, { status: 400 });
  }

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

  const existing = await prisma.document.findFirst({
    where: { dossierId: dossier.id, templateOrigin: "lms_certificate" },
  });
  if (existing) return NextResponse.json(existing);

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const courseTitle = dossier.session.course.title;
  const learnerName = `${dossier.contact.firstName} ${dossier.contact.lastName}`;

  const bodyText =
    `ATTESTATION DE RÉUSSITE\n\n` +
    `${organization.name} atteste que :\n\n` +
    `${learnerName}\n\n` +
    `a suivi et validé l'ensemble des modules e-learning de la formation :\n\n` +
    `« ${courseTitle} »\n\n` +
    `Modules validés :\n` +
    modules.map((m, i) => `${i + 1}. ${m.title}`).join("\n") +
    `\n\nFait le ${new Date().toLocaleDateString("fr-FR")}.`;

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: `Attestation de réussite — ${courseTitle} — ${learnerName}`,
      bodyText,
      templateOrigin: "lms_certificate",
      category: "results_summary",
    },
  });

  return NextResponse.json(document, { status: 201 });
}
