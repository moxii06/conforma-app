import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { unlockNextModuleIfNeeded, markDossierAccessed } from "@/lib/lms";

const schema = z.object({
  dossierId: z.string().min(1),
  answers: z.record(z.union([z.string(), z.array(z.string())])),
});

type Option = { id: string; text: string; correct: boolean };

// Grading happens entirely server-side from the stored question data (never
// trusts a client-submitted score) — the same "propose, don't trust the
// client" posture as everywhere else auto-grading/auto-completion happens
// in this app (see the video-scrub confirmation in LmsModulePlayer).
function gradeQuestion(question: { type: string; options: unknown; correctAnswerText: string | null }, answer: string | string[] | undefined): boolean {
  if (question.type === "short_answer") {
    if (typeof answer !== "string" || !question.correctAnswerText) return false;
    return answer.trim().toLowerCase() === question.correctAnswerText.trim().toLowerCase();
  }

  const options = (question.options as Option[] | null) ?? [];
  const correctIds = new Set(options.filter((o) => o.correct).map((o) => o.id));

  if (question.type === "multiple_choice") {
    if (!Array.isArray(answer)) return false;
    const given = new Set(answer);
    return given.size === correctIds.size && Array.from(given).every((id) => correctIds.has(id));
  }

  // single_choice | true_false
  return typeof answer === "string" && correctIds.has(answer);
}

export async function POST(request: Request, { params }: { params: { quizId: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const quiz = await prisma.quiz.findFirst({
    where: { id: params.quizId, module: { course: { organizationId: session.organizationId } } },
    include: { questions: true, module: true },
  });
  if (!quiz) return NextResponse.json({ error: "Quiz introuvable." }, { status: 404 });
  if (quiz.questions.length === 0) return NextResponse.json({ error: "Ce quiz n'a pas encore de questions." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({ where: { id: parsed.data.dossierId, organizationId: session.organizationId } });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isOwnDossier && !isStaff) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existingProgress = await prisma.elearningProgress.findFirst({ where: { dossierId: dossier.id, moduleId: quiz.moduleId } });
  if (!existingProgress && !isStaff) {
    return NextResponse.json({ error: "Ce module ne vous a pas été assigné." }, { status: 403 });
  }

  if (isOwnDossier) await markDossierAccessed(dossier.id);

  if (quiz.maxAttempts != null) {
    const attemptCount = await prisma.quizAttempt.count({ where: { quizId: quiz.id, dossierId: dossier.id } });
    if (attemptCount >= quiz.maxAttempts) {
      return NextResponse.json({ error: "Nombre maximal de tentatives atteint." }, { status: 403 });
    }
  }

  const correctCount = quiz.questions.filter((q) => gradeQuestion(q, parsed.data.answers[q.id])).length;
  const scorePercent = Math.round((correctCount / quiz.questions.length) * 100);
  const passed = scorePercent >= quiz.minScorePercent;

  const attempt = await prisma.quizAttempt.create({
    data: { quizId: quiz.id, dossierId: dossier.id, answers: parsed.data.answers, scorePercent, passed },
  });

  const wasAlreadyComplete = (existingProgress?.percentComplete ?? 0) >= 100;
  if (passed && !wasAlreadyComplete) {
    const progress = existingProgress
      ? await prisma.elearningProgress.update({ where: { id: existingProgress.id }, data: { percentComplete: 100, lastEventAt: new Date() } })
      : await prisma.elearningProgress.create({
          data: { dossierId: dossier.id, moduleId: quiz.moduleId, percentComplete: 100, lastEventAt: new Date(), assignedByUserId: session.userId, assignedByName: session.name || session.email },
        });
    void progress;
    await unlockNextModuleIfNeeded({ dossierId: dossier.id, courseId: quiz.module.courseId, currentOrder: quiz.module.order });
  } else if (existingProgress) {
    await prisma.elearningProgress.update({ where: { id: existingProgress.id }, data: { lastEventAt: new Date() } });
  }

  return NextResponse.json({ scorePercent, passed, correctCount, totalQuestions: quiz.questions.length }, { status: 201 });
}
