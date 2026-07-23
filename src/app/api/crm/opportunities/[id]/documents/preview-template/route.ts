import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";

// Opportunity-level counterpart to /api/dossiers/[id]/documents/preview-template
// — a prospect doesn't have a Dossier (or a session) yet, so this merges
// against the Contact only; every session.* merge field resolves to "".
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const templateId = new URL(request.url).searchParams.get("templateId");
  if (!templateId) return NextResponse.json({ error: "templateId requis." }, { status: 400 });

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  // No real session yet at the prospect stage — {{session.startsAt}} is left
  // blank rather than filled with a fake date (mergeTemplate treats a
  // missing session as "" for every session.* field, courseTitle included).
  const bodyText = mergeTemplate(template.bodyText, {
    contact: opportunity.contact,
    organization,
    session: null,
  });

  return NextResponse.json({
    title: `${template.title} — ${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
    bodyText,
    category: template.category,
  });
}
