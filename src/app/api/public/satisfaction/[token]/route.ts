import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Deliberately unauthenticated — the token itself is the capability, same
// pattern as /api/public/needs-assessment/[token]. Works whether the
// learner has a mon-espace account or not (client feedback: must work
// both ways — email link, and also reachable from mon-espace when logged in).
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const response = await prisma.satisfactionSurveyResponse.findUnique({
    where: { token: params.token },
    include: { survey: { include: { questions: true } } },
  });
  if (!response) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  if (response.status === "completed") {
    return NextResponse.json({ error: "Ce questionnaire a déjà été complété." }, { status: 409 });
  }

  const answerSchema = z.record(z.union([z.string(), z.array(z.string())]));
  const body = await request.json().catch(() => null);
  const parsed = answerSchema.safeParse(body?.answers);
  if (!parsed.success) return NextResponse.json({ error: "Réponses invalides." }, { status: 400 });

  const questionIds = new Set(response.survey.questions.map((q) => q.id));
  for (const key of Object.keys(parsed.data)) {
    if (!questionIds.has(key)) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.satisfactionSurveyResponse.update({
      where: { id: response.id },
      data: { answers: parsed.data, status: "completed", completedAt: new Date() },
    }),
    prisma.dossier.update({
      where: { id: response.dossierId },
      data: response.survey.kind === "hot" ? { evaluationHotDone: true } : { evaluationColdDone: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
