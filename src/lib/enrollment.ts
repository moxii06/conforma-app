import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { LEARNER_CATEGORY_VALUES } from "@/lib/bpfCategories";

export class EnrollmentError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

type NewContactInput = { firstName: string; lastName: string; email: string; phone?: string };

export const companyInputSchema = z.object({
  name: z.string().min(1),
  siret: z.string().optional(),
  address: z.string().optional(),
  responsableFirstName: z.string().optional(),
  responsableLastName: z.string().optional(),
  responsableEmail: z.string().email().optional().or(z.literal("")),
  responsablePhone: z.string().optional(),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const enrollmentCategorySchema = z.object({
  learnerCategory: z.enum(LEARNER_CATEGORY_VALUES).optional(),
  company: companyInputSchema.optional(),
});

// Looked up by name within the org (no SIRET requirement — a small OFP
// often doesn't have it on hand at enrollment time) — an existing company
// with that name is reused and its details refreshed, not duplicated, so
// re-enrolling another employee of the same company converges on one
// record instead of forking near-duplicates.
export async function applyCompanyInfo(organizationId: string, contactId: string, company: CompanyInput) {
  const existing = await prisma.company.findFirst({ where: { organizationId, name: company.name } });
  const data = {
    name: company.name,
    siret: company.siret || undefined,
    address: company.address || undefined,
    responsableFirstName: company.responsableFirstName || undefined,
    responsableLastName: company.responsableLastName || undefined,
    responsableEmail: company.responsableEmail || undefined,
    responsablePhone: company.responsablePhone || undefined,
  };
  const record = existing
    ? await prisma.company.update({ where: { id: existing.id }, data })
    : await prisma.company.create({ data: { organizationId, ...data } });
  await prisma.contact.update({ where: { id: contactId }, data: { companyId: record.id } });
}

// A learner added from "Catalogue de formations" may already exist as a
// Contact (past prospect/client) or may be typed in fresh — either way they
// end up as the same Contact record, so re-adding someone by email later
// (a repeat learner) reuses their history instead of forking a duplicate.
export async function resolveContact(organizationId: string, input: { contactId: string } | NewContactInput) {
  if ("contactId" in input) {
    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, organizationId } });
    if (!contact) throw new EnrollmentError("Contact introuvable.", 404);
    return contact;
  }
  return prisma.contact.upsert({
    where: { organizationId_email: { organizationId, email: input.email } },
    update: { firstName: input.firstName, lastName: input.lastName, phone: input.phone || undefined },
    create: {
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone || null,
    },
  });
}

// A Dossier can't exist without a Session (BPF/Qualiopi need real
// dates/format/capacity attached to every enrollment) — but forcing staff
// to go create one in Planning before they can add a single learner from
// the course catalog is exactly the friction the "300+ learners/year" ask
// was about. So: if the course has no session yet, one is created silently
// with generous defaults (editable later from Planning); if it has exactly
// one, that one is reused without asking; if it has several, the caller
// must say which one — auto-picking among several *specific, dated*
// sessions would silently put someone in a class the staff didn't choose.
const DEFAULT_SESSION_CAPACITY = 500;

export async function resolveEnrollmentSession(organizationId: string, courseId: string, sessionId?: string) {
  if (sessionId) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, courseId, organizationId },
      include: { _count: { select: { dossiers: true } } },
    });
    if (!session) throw new EnrollmentError("Session introuvable.", 404);
    if (session._count.dossiers >= session.capacity) throw new EnrollmentError("Cette session est complète.", 400);
    return session;
  }

  const sessions = await prisma.session.findMany({
    where: { organizationId, courseId },
    include: { _count: { select: { dossiers: true } } },
    orderBy: { startsAt: "asc" },
  });

  if (sessions.length === 0) {
    // Quick-adding a learner from the course catalog, with no session set up
    // yet, matches the "just always available, no cohort date" (bande
    // passante) pattern far more often than a real dated cohort — a staff
    // member who *does* want a scheduled cohort creates that session
    // explicitly from Planning first, which is exactly what makes this
    // branch not fire (sessions.length would be 1+).
    return prisma.session.create({
      data: {
        organizationId,
        courseId,
        mode: "ROLLING",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        format: "REMOTE",
        capacity: DEFAULT_SESSION_CAPACITY,
        status: "DRAFT",
      },
      include: { _count: { select: { dossiers: true } } },
    });
  }

  if (sessions.length === 1) {
    const only = sessions[0];
    if (only._count.dossiers >= only.capacity) {
      throw new EnrollmentError(
        "La seule session de cette formation est complète. Créez-en une nouvelle depuis le planning.",
        400
      );
    }
    return only;
  }

  throw new EnrollmentError("Plusieurs sessions existent pour cette formation, choisissez-en une.", 409, {
    needsSessionSelection: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      format: s.format,
      spotsLeft: s.capacity - s._count.dossiers,
    })),
  });
}

// accessDurationDays only makes sense — and is only ever persisted — for a
// ROLLING session; on a dated cohort session it's silently dropped rather
// than rejected, since a client might send a leftover value from a
// previous choice without meaning anything by it.
export async function createDossier(
  organizationId: string,
  contactId: string,
  session: { id: string; mode: string },
  accessDurationDays?: number,
  learnerCategory?: string | null
) {
  const existing = await prisma.dossier.findFirst({ where: { contactId, sessionId: session.id } });
  if (existing) throw new EnrollmentError("Ce contact est déjà inscrit à cette session.", 409);
  return prisma.dossier.create({
    data: {
      organizationId,
      contactId,
      sessionId: session.id,
      accessDurationDays: session.mode === "ROLLING" ? accessDurationDays ?? null : null,
      learnerCategory: learnerCategory || null,
    },
    include: { contact: true },
  });
}
