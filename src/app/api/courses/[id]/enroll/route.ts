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

const schema = z.union([
  z
    .object({ contactId: z.string().min(1), sessionId: z.string().optional(), accessDurationDays: z.number().int().positive().optional() })
    .merge(enrollmentCategorySchema),
  z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      sessionId: z.string().optional(),
      accessDurationDays: z.number().int().positive().optional(),
    })
    .merge(enrollmentCategorySchema),
]);

// The direct, CRM-independent enrollment path from "Catalogue de
// formations": unlike /api/planning/sessions/[id]/enroll (which requires a
// CONTRACT_SIGNED Opportunity), this lets staff add a learner straight from
// the course — either an already-known Contact or someone typed in on the
// spot — without a sales pipeline in between.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const course = await prisma.course.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  try {
    const contact = await resolveContact(
      auth.organizationId,
      "contactId" in parsed.data ? { contactId: parsed.data.contactId } : parsed.data
    );
    const session = await resolveEnrollmentSession(auth.organizationId, course.id, parsed.data.sessionId);
    if (parsed.data.company) {
      await applyCompanyInfo(auth.organizationId, contact.id, parsed.data.company);
    }
    const dossier = await createDossier(
      auth.organizationId,
      contact.id,
      session,
      parsed.data.accessDurationDays,
      parsed.data.learnerCategory
    );
    return NextResponse.json(dossier, { status: 201 });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    throw err;
  }
}
