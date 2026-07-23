import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  minScorePercent: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).nullable(),
});

// Upsert — a "quiz" module has exactly one Quiz row for its settings,
// created lazily the first time staff configures it rather than at module
// creation (a fresh quiz module has no questions yet either).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });
  if (module_.type !== "quiz") return NextResponse.json({ error: "Ce module n'est pas un quiz." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const quiz = await prisma.quiz.upsert({
    where: { moduleId: module_.id },
    update: { minScorePercent: parsed.data.minScorePercent, maxAttempts: parsed.data.maxAttempts },
    create: { moduleId: module_.id, minScorePercent: parsed.data.minScorePercent, maxAttempts: parsed.data.maxAttempts },
  });

  return NextResponse.json(quiz);
}
