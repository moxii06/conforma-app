import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// Exactly one of userId / subcontractorId — an evaluation is always about
// one specific intervenant.
const schema = z
  .object({
    userId: z.string().optional(),
    subcontractorId: z.string().optional(),
    evaluatedAt: z.string().min(1),
    strengths: z.string().optional(),
    developmentPlan: z.string().optional(),
    comment: z.string().optional(),
  })
  .refine((d) => Boolean(d.userId) !== Boolean(d.subcontractorId), {
    message: "Un intervenant (interne ou sous-traitant) doit être sélectionné.",
  });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  let subjectName: string | null = null;
  if (parsed.data.userId) {
    const user = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: session.organizationId },
      select: { name: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "Intervenant introuvable." }, { status: 404 });
    subjectName = user.name || user.email;
  } else {
    const sub = await prisma.subcontractor.findFirst({
      where: { id: parsed.data.subcontractorId, organizationId: session.organizationId },
      select: { name: true },
    });
    if (!sub) return NextResponse.json({ error: "Sous-traitant introuvable." }, { status: 404 });
    subjectName = sub.name;
  }

  const evaluation = await prisma.intervenantEvaluation.create({
    data: {
      organizationId: session.organizationId,
      userId: parsed.data.userId || null,
      subcontractorId: parsed.data.subcontractorId || null,
      subjectName,
      evaluatedAt: new Date(parsed.data.evaluatedAt),
      evaluatorName: session.name || session.email,
      strengths: parsed.data.strengths || null,
      developmentPlan: parsed.data.developmentPlan || null,
      comment: parsed.data.comment || null,
    },
  });

  return NextResponse.json(evaluation, { status: 201 });
}
