import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, canManageSessionInvitations } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";

// Session-scoped counterpart to /api/dossiers/[id]/documents/preview-template
// — backs the bulk-send dialog's template preview. Not tied to one
// recipient (this is going to N learners at once), so contact.* merge
// fields resolve to blank rather than one specific person's info; the
// session/course/organization fields still merge normally.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const templateId = new URL(request.url).searchParams.get("templateId");
  if (!templateId) return NextResponse.json({ error: "templateId requis." }, { status: 400 });

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { course: true },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (!canManageSessionInvitations(auth.roles, auth.userId, session)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const bodyText = mergeTemplate(template.bodyText, {
    contact: { firstName: "", lastName: "", email: "", phone: null },
    organization,
    session: { courseTitle: session.course.title, startsAt: session.startsAt, location: session.location },
    course: session.course,
  });

  return NextResponse.json({ title: `${template.title} — ${session.course.title}`, bodyText, category: template.category });
}
