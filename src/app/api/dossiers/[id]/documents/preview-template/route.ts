import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { Role } from "@prisma/client";

// Merges a template against this dossier's contact/session WITHOUT
// persisting anything — backs the "Envoyer un document" dialog's live
// preview as staff switch between templates, before they've decided to
// send (and possibly edit the text first). Contrast with
// /api/documents/generate, which creates the Document immediately.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const templateId = new URL(request.url).searchParams.get("templateId");
  if (!templateId) return NextResponse.json({ error: "templateId requis." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const bodyText = mergeTemplate(template.bodyText, {
    contact: dossier.contact,
    organization,
    session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
    dossier: { retentionUntil: dossier.retentionUntil },
  });

  return NextResponse.json({
    title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
    bodyText,
    category: template.category,
  });
}
