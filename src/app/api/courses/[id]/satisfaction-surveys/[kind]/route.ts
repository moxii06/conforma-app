import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { SURVEY_KIND_VALUES } from "@/lib/satisfactionSurveys";

const questionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rating"), prompt: z.string().min(1) }),
  z.object({ type: z.literal("text"), prompt: z.string().min(1) }),
  z.object({
    type: z.literal("single_choice"),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  }),
  z.object({
    type: z.literal("multiple_choice"),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  }),
]);

const schema = z.object({ questions: z.array(questionSchema) });

// One editable question set per (course, kind) — staff replace the whole
// list on save rather than incrementally add/remove server-side, since a
// survey builder is edited as a batch, not question-by-question like the
// LMS quiz builder.
export async function PUT(request: Request, { params }: { params: { id: string; kind: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!SURVEY_KIND_VALUES.includes(params.kind as (typeof SURVEY_KIND_VALUES)[number])) {
    return NextResponse.json({ error: "Type d'évaluation invalide." }, { status: 400 });
  }

  const course = await prisma.course.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const survey = await prisma.satisfactionSurvey.upsert({
    where: { courseId_kind: { courseId: course.id, kind: params.kind } },
    update: {},
    create: { organizationId: session.organizationId, courseId: course.id, kind: params.kind },
  });

  await prisma.$transaction([
    prisma.satisfactionSurveyQuestion.deleteMany({ where: { surveyId: survey.id } }),
    prisma.satisfactionSurveyQuestion.createMany({
      data: parsed.data.questions.map((q, i) => ({
        surveyId: survey.id,
        order: i,
        type: q.type,
        prompt: q.prompt,
        options: q.type === "single_choice" || q.type === "multiple_choice" ? q.options : undefined,
      })),
    }),
  ]);

  const updated = await prisma.satisfactionSurvey.findUnique({
    where: { id: survey.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(updated);
}
