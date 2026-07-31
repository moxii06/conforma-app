import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { applyCompanyInfo, assertCourseHasRoom, createDossier, enrollmentCategorySchema, EnrollmentError } from "@/lib/enrollment";

const schema = z.object({ opportunityId: z.string().min(1) }).merge(enrollmentCategorySchema);

// Enrolling a prospect into a session is the missing link between CRM and
// Planning: turns a CONTRACT_SIGNED Opportunity into an actual Dossier
// (learner enrollment) tied to this Session, and advances the opportunity
// to SESSION_SCHEDULED so the CRM pipeline reflects it. Restricted to full
// planning access (ADMIN_OF/ADMIN_MANAGER) — same as session creation.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { course: { select: { id: true, maxLearners: true } } },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  try {
    await assertCourseHasRoom(auth.organizationId, session.course);
  } catch (err) {
    if (err instanceof EnrollmentError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Prospect requis." }, { status: 400 });

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: parsed.data.opportunityId, organizationId: auth.organizationId },
    // needsAssessmentRequests n'est plus chargé ici : createDossier le
    // détecte lui-même, pour les deux portes d'inscription à la fois.
    include: { contact: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (opportunity.stage !== "CONTRACT_SIGNED") {
    return NextResponse.json({ error: "Seules les opportunités avec convention signée peuvent être inscrites." }, { status: 400 });
  }

  if (parsed.data.company) {
    await applyCompanyInfo(auth.organizationId, opportunity.contactId, parsed.data.company);
  }

  // Passe par createDossier comme la porte catalogue, au lieu du
  // prisma.dossier.create maison qu'il y avait ici. Les deux portes
  // produisaient sinon des dossiers différents pour la même personne et la
  // même session : contrôle de doublon, durée d'accès en formation continue
  // et détection du recueil des besoins n'existaient que d'un côté.
  //
  // Le seul fait que cette porte connaît en propre et que l'autre ignore :
  // l'opportunité est au stade « convention signée », donc la convention
  // l'est aussi. Il est transmis explicitement plutôt que codé en dur ici.
  let dossier;
  try {
    dossier = await createDossier(
      auth.organizationId,
      opportunity.contactId,
      session,
      undefined,
      parsed.data.learnerCategory || opportunity.contact.defaultLearnerCategory || null,
      { contractSigned: true },
    );
  } catch (err) {
    if (err instanceof EnrollmentError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: "SESSION_SCHEDULED" } });

  return NextResponse.json(dossier, { status: 201 });
}
