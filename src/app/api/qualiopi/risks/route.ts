import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  risk: z.string().min(1),
  courseId: z.string().optional(),
  sourceNonConformityId: z.string().optional(),
  origin: z.enum(["reclamation", "resultat", "audit", "veille", "autre"]),
  probability: z.enum(["faible", "moyenne", "elevee"]),
  severity: z.enum(["faible", "moyenne", "elevee"]),
  preventiveMeasure: z.string().optional(),
  correctiveAction: z.string().optional(),
  dueDate: z.string().optional(),
  evidenceNote: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.courseId) {
    const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, organizationId: session.organizationId } });
    if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  }
  if (parsed.data.sourceNonConformityId) {
    const source = await prisma.nonConformity.findFirst({ where: { id: parsed.data.sourceNonConformityId, organizationId: session.organizationId } });
    if (!source) return NextResponse.json({ error: "Élément source introuvable." }, { status: 404 });
  }

  const risk = await prisma.qualityRisk.create({
    data: {
      organizationId: session.organizationId,
      risk: parsed.data.risk,
      courseId: parsed.data.courseId || null,
      sourceNonConformityId: parsed.data.sourceNonConformityId || null,
      origin: parsed.data.origin,
      probability: parsed.data.probability,
      severity: parsed.data.severity,
      preventiveMeasure: parsed.data.preventiveMeasure || null,
      correctiveAction: parsed.data.correctiveAction || null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      evidenceNote: parsed.data.evidenceNote || null,
      ownerUserId: session.userId,
      ownerName: session.name || session.email,
    },
  });

  return NextResponse.json(risk, { status: 201 });
}
