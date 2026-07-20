import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  // Prefer the org's own adapted template over the Conforma starter, if
  // they've forked one — same "org copy wins" logic as the library page.
  const template =
    (await prisma.documentTemplate.findFirst({
      where: { organizationId: session.organizationId, category: "needs_assessment" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.documentTemplate.findFirst({
      where: { organizationId: null, category: "needs_assessment" },
    }));

  if (!template) {
    return NextResponse.json({ error: "Aucun modèle de recueil des besoins disponible." }, { status: 400 });
  }

  const token = randomBytes(20).toString("hex");

  await prisma.needsAssessmentRequest.create({
    data: {
      organizationId: session.organizationId,
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
      token,
      templateBody: template.bodyText,
      sentByUserId: session.userId,
      sentByName: session.name || session.email,
    },
  });

  const formUrl = `${new URL(request.url).origin}/formulaire/${token}`;
  return NextResponse.json({ formUrl }, { status: 201 });
}
