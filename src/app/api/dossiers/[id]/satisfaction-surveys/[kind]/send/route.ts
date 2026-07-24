import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { SURVEY_KIND_VALUES, sendSatisfactionSurvey } from "@/lib/satisfactionSurveys";

// Manual counterpart to the automatic sends in the daily cron (hot at
// session end, cold per the existing satisfaction_not_collected rule) —
// staff can trigger either one on demand, e.g. for a ROLLING session
// (no fixed endsAt to trigger off of) or to resend after a bounce.
export async function POST(request: Request, { params }: { params: { id: string; kind: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!SURVEY_KIND_VALUES.includes(params.kind as (typeof SURVEY_KIND_VALUES)[number])) {
    return NextResponse.json({ error: "Type d'évaluation invalide." }, { status: 400 });
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const survey = await prisma.satisfactionSurvey.findUnique({
    where: { courseId_kind: { courseId: dossier.session.courseId, kind: params.kind } },
  });
  if (!survey) {
    return NextResponse.json(
      { error: "Aucune enquête de satisfaction n'a été configurée pour cette formation." },
      { status: 400 }
    );
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const origin = new URL(request.url).origin;
  const response = await sendSatisfactionSurvey({
    organization,
    dossier,
    contact: dossier.contact,
    courseTitle: dossier.session.course.title,
    surveyId: survey.id,
    origin,
  });

  return NextResponse.json(response, { status: 201 });
}
