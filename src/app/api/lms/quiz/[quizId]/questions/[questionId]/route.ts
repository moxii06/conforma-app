import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

export async function DELETE(_request: Request, { params }: { params: { quizId: string; questionId: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const question = await prisma.quizQuestion.findFirst({
    where: { id: params.questionId, quizId: params.quizId, quiz: { module: { course: { organizationId: session.organizationId } } } },
  });
  if (!question) return NextResponse.json({ error: "Question introuvable." }, { status: 404 });

  await prisma.quizQuestion.delete({ where: { id: question.id } });
  return NextResponse.json({ ok: true });
}
