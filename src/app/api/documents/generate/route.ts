import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";

const schema = z.object({ templateId: z.string().min(1), dossierId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const [template, dossier, organization] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: {
        id: parsed.data.templateId,
        OR: [{ organizationId: session.organizationId }, { organizationId: null }],
      },
    }),
    prisma.dossier.findFirst({
      where: { id: parsed.data.dossierId, organizationId: session.organizationId },
      include: { contact: true, session: { include: { course: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
  ]);

  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const merged = mergeTemplate(template.bodyText, {
    contact: dossier.contact,
    organization,
    session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
    dossier: { retentionUntil: dossier.retentionUntil },
  });

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
      bodyText: merged,
      templateOrigin: template.title,
      category: template.category,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
