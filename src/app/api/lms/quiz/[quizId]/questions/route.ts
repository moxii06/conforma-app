import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const optionSchema = z.object({ id: z.string().min(1), text: z.string().min(1), correct: z.boolean() });

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single_choice"), prompt: z.string().min(1), options: z.array(optionSchema).min(2) }),
  z.object({ type: z.literal("multiple_choice"), prompt: z.string().min(1), options: z.array(optionSchema).min(2) }),
  z.object({ type: z.literal("true_false"), prompt: z.string().min(1), options: z.array(optionSchema).length(2) }),
  z.object({ type: z.literal("short_answer"), prompt: z.string().min(1), correctAnswerText: z.string().min(1) }),
]);

export async function POST(request: Request, { params }: { params: { quizId: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const quiz = await prisma.quiz.findFirst({
    where: { id: params.quizId, module: { course: { organizationId: session.organizationId } } },
  });
  if (!quiz) return NextResponse.json({ error: "Quiz introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.type !== "short_answer" && !parsed.data.options.some((o) => o.correct)) {
    return NextResponse.json({ error: "Au moins une réponse correcte requise." }, { status: 400 });
  }

  const order = await prisma.quizQuestion.count({ where: { quizId: quiz.id } });

  const question = await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      order,
      type: parsed.data.type,
      prompt: parsed.data.prompt,
      options: parsed.data.type === "short_answer" ? undefined : parsed.data.options,
      correctAnswerText: parsed.data.type === "short_answer" ? parsed.data.correctAnswerText : undefined,
    },
  });

  return NextResponse.json(question, { status: 201 });
}
