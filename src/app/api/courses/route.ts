import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import {
  resolveContact,
  resolveEnrollmentSession,
  createDossier,
  applyCompanyInfo,
  enrollmentCategorySchema,
  EnrollmentError,
} from "@/lib/enrollment";

const learnerSchema = z.union([
  z
    .object({ contactId: z.string().min(1), accessDurationDays: z.number().int().positive().optional() })
    .merge(enrollmentCategorySchema),
  z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      accessDurationDays: z.number().int().positive().optional(),
    })
    .merge(enrollmentCategorySchema),
]);

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  responsibleUserIds: z.array(z.string()).optional(),
  subcontractorIds: z.array(z.string()).optional(),
  durationHours: z.number().int().positive().optional(),
  priceCents: z.number().int().positive().optional(),
  initialLearners: z.array(learnerSchema).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.responsibleUserIds?.length) {
    const count = await prisma.user.count({
      where: { id: { in: parsed.data.responsibleUserIds }, organizationId: session.organizationId },
    });
    if (count !== parsed.data.responsibleUserIds.length) {
      return NextResponse.json({ error: "Responsable introuvable." }, { status: 404 });
    }
  }
  if (parsed.data.subcontractorIds?.length) {
    const count = await prisma.subcontractor.count({
      where: { id: { in: parsed.data.subcontractorIds }, organizationId: session.organizationId },
    });
    if (count !== parsed.data.subcontractorIds.length) {
      return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });
    }
  }

  const course = await prisma.course.create({
    data: {
      organizationId: session.organizationId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      durationHours: parsed.data.durationHours ?? null,
      priceCents: parsed.data.priceCents ?? null,
      responsibleUsers: parsed.data.responsibleUserIds?.length
        ? { connect: parsed.data.responsibleUserIds.map((id) => ({ id })) }
        : undefined,
      subcontractors: parsed.data.subcontractorIds?.length
        ? { connect: parsed.data.subcontractorIds.map((id) => ({ id })) }
        : undefined,
    },
    include: { responsibleUsers: true, subcontractors: true },
  });

  // A brand-new course has zero sessions, so this always hits the
  // "auto-create one" branch in resolveEnrollmentSession — no ambiguity to
  // resolve here, every learner in the batch lands in that same session.
  let enrolledCount = 0;
  if (parsed.data.initialLearners?.length) {
    for (const learner of parsed.data.initialLearners) {
      try {
        const contact = await resolveContact(session.organizationId, learner);
        if (learner.company) {
          await applyCompanyInfo(session.organizationId, contact.id, learner.company);
        }
        const enrollSession = await resolveEnrollmentSession(session.organizationId, course.id);
        await createDossier(
          session.organizationId,
          contact.id,
          enrollSession,
          learner.accessDurationDays,
          learner.learnerCategory ?? contact.defaultLearnerCategory
        );
        enrolledCount++;
      } catch (err) {
        if (!(err instanceof EnrollmentError)) throw err;
      }
    }
  }

  return NextResponse.json({ ...course, enrolledCount }, { status: 201 });
}
