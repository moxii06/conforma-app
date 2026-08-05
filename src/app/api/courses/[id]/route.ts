import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  responsibleUserIds: z.array(z.string()).optional(),
  subcontractorIds: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
  durationHours: z.number().int().positive().nullable().optional(),
  priceCents: z.number().int().positive().nullable().optional(),
  certificateValidityMonths: z.number().int().positive().nullable().optional(),
  maxLearners: z.number().int().positive().nullable().optional(),
  prerequisites: z.string().nullable().optional(),
  objectives: z.string().nullable().optional(),
  accessDelay: z.string().nullable().optional(),
  accessModalities: z.string().nullable().optional(),
  teachingMethods: z.string().nullable().optional(),
  evaluationModalities: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  allowVideoSkip: z.boolean().optional(),
  publicEnrollment: z.enum(["none", "request", "direct"]).optional(),
  // Règles du parcours, modifiables après coup comme le reste. `null` sur la
  // politique de rétractation remet la formation en héritage de l'organisme
  // — c'est une valeur qu'on veut pouvoir REPOSER, d'où le `nullable`.
  sequentialUnlock: z.boolean().optional(),
  withdrawalAccessPolicy: z.enum(["closed", "partial"]).nullable().optional(),
});

// Single PATCH for both "edit the course's details" and "archive/unarchive
// it" — same pattern as the session PATCH route, both are just Course field
// updates. Archiving never deletes anything: sessions, dossiers, documents
// and certificates tied to the course stay exactly as they were, only
// archivedAt is set so the course drops out of the default catalog view.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.course.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  if (data.responsibleUserIds) {
    const count = await prisma.user.count({
      where: { id: { in: data.responsibleUserIds }, organizationId: session.organizationId },
    });
    if (count !== data.responsibleUserIds.length) {
      return NextResponse.json({ error: "Responsable introuvable." }, { status: 404 });
    }
  }
  if (data.subcontractorIds) {
    const count = await prisma.subcontractor.count({
      where: { id: { in: data.subcontractorIds }, organizationId: session.organizationId },
    });
    if (count !== data.subcontractorIds.length) {
      return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });
    }
  }

  const updated = await prisma.course.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.responsibleUserIds ? { responsibleUsers: { set: data.responsibleUserIds.map((id) => ({ id })) } } : {}),
      ...(data.subcontractorIds ? { subcontractors: { set: data.subcontractorIds.map((id) => ({ id })) } } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
      ...(data.durationHours !== undefined ? { durationHours: data.durationHours } : {}),
      ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
      ...(data.certificateValidityMonths !== undefined ? { certificateValidityMonths: data.certificateValidityMonths } : {}),
      ...(data.maxLearners !== undefined ? { maxLearners: data.maxLearners } : {}),
      ...(data.prerequisites !== undefined ? { prerequisites: data.prerequisites || null } : {}),
      ...(data.objectives !== undefined ? { objectives: data.objectives || null } : {}),
      ...(data.accessDelay !== undefined ? { accessDelay: data.accessDelay || null } : {}),
      ...(data.accessModalities !== undefined ? { accessModalities: data.accessModalities || null } : {}),
      ...(data.teachingMethods !== undefined ? { teachingMethods: data.teachingMethods || null } : {}),
      ...(data.evaluationModalities !== undefined ? { evaluationModalities: data.evaluationModalities || null } : {}),
      ...(data.sequentialUnlock !== undefined ? { sequentialUnlock: data.sequentialUnlock } : {}),
      ...(data.withdrawalAccessPolicy !== undefined ? { withdrawalAccessPolicy: data.withdrawalAccessPolicy } : {}),
      ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
      ...(data.allowVideoSkip !== undefined ? { allowVideoSkip: data.allowVideoSkip } : {}),
      ...(data.publicEnrollment !== undefined ? { publicEnrollment: data.publicEnrollment } : {}),
    },
    include: { responsibleUsers: true, subcontractors: true },
  });

  return NextResponse.json(updated);
}

// A course can only be hard-deleted while nothing has actually happened on
// it yet — the moment a single learner is enrolled (via any of its
// sessions), archiving is the only path: their dossier's history, documents
// and certificates must stay intact and queryable, which a delete can't
// offer. Below that line, nothing hanging off the course (LMS content,
// empty sessions, automation rules, satisfaction surveys) has any meaning
// without it, so the transaction takes it all — children before parents,
// since none of these FKs cascade at the database level (RESTRICT, so the
// course itself can't be deleted while any of them still point to it).
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.course.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const learnerCount = await prisma.dossier.count({ where: { session: { courseId: existing.id } } });
  if (learnerCount > 0) {
    return NextResponse.json(
      {
        error: `${learnerCount} apprenant${learnerCount > 1 ? "s" : ""} déjà inscrit${learnerCount > 1 ? "s" : ""} sur cette formation — impossible de la supprimer. Archivez-la à la place.`,
      },
      { status: 409 }
    );
  }

  const moduleIds = (
    await prisma.elearningModule.findMany({ where: { courseId: existing.id }, select: { id: true } })
  ).map((m) => m.id);

  try {
    await prisma.$transaction([
      prisma.elearningModuleAttachment.deleteMany({ where: { moduleId: { in: moduleIds } } }),
      prisma.elearningModuleVersion.deleteMany({ where: { moduleId: { in: moduleIds } } }),
      prisma.quizQuestion.deleteMany({ where: { quiz: { moduleId: { in: moduleIds } } } }),
      prisma.quiz.deleteMany({ where: { moduleId: { in: moduleIds } } }),
      prisma.elearningModule.deleteMany({ where: { courseId: existing.id } }),
      prisma.chapter.deleteMany({ where: { courseId: existing.id } }),
      prisma.session.deleteMany({ where: { courseId: existing.id } }),
      prisma.satisfactionSurveyResponse.deleteMany({ where: { survey: { courseId: existing.id } } }),
      prisma.satisfactionSurveyQuestion.deleteMany({ where: { survey: { courseId: existing.id } } }),
      prisma.satisfactionSurvey.deleteMany({ where: { courseId: existing.id } }),
      prisma.automationRule.deleteMany({ where: { courseId: existing.id } }),
      prisma.course.delete({ where: { id: existing.id } }),
    ]);
  } catch {
    return NextResponse.json({ error: "Suppression impossible — des éléments liés subsistent sur cette formation." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
