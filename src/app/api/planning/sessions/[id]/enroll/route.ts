import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { applyCompanyInfo, enrollmentCategorySchema } from "@/lib/enrollment";

const schema = z.object({ opportunityId: z.string().min(1) }).merge(enrollmentCategorySchema);

// Enrolling a prospect into a session is the missing link between CRM and
// Planning: turns a CONTRACT_SIGNED Opportunity into an actual Dossier
// (learner enrollment) tied to this Session, and advances the opportunity
// to SESSION_SCHEDULED so the CRM pipeline reflects it. Restricted to full
// planning access (ADMIN_OF/ADMIN_MANAGER) — same as session creation.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const session = await prisma.session.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Prospect requis." }, { status: 400 });

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: parsed.data.opportunityId, organizationId: auth.organizationId },
    include: { needsAssessmentRequests: { where: { status: "completed" }, take: 1 } },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (opportunity.stage !== "CONTRACT_SIGNED") {
    return NextResponse.json({ error: "Seules les opportunités avec convention signée peuvent être inscrites." }, { status: 400 });
  }

  const existing = await prisma.dossier.findFirst({ where: { contactId: opportunity.contactId, sessionId: session.id } });
  if (existing) return NextResponse.json({ error: "Ce contact est déjà inscrit à cette session." }, { status: 409 });

  if (parsed.data.company) {
    await applyCompanyInfo(auth.organizationId, opportunity.contactId, parsed.data.company);
  }

  const [dossier] = await prisma.$transaction([
    prisma.dossier.create({
      data: {
        organizationId: auth.organizationId,
        contactId: opportunity.contactId,
        sessionId: session.id,
        contractSigned: true,
        needsAssessmentDone: opportunity.needsAssessmentRequests.length > 0,
        learnerCategory: parsed.data.learnerCategory || null,
      },
    }),
    prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: "SESSION_SCHEDULED" } }),
  ]);

  return NextResponse.json(dossier, { status: 201 });
}
