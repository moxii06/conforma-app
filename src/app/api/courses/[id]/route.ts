import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  responsibleUserIds: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
});

// Single PATCH for both "edit the course's details" and "archive/unarchive
// it" — same pattern as the session PATCH route, both are just Course field
// updates. Archiving never deletes anything: sessions, dossiers, documents
// and certificates tied to the course stay exactly as they were, only
// archivedAt is set so the course drops out of the default catalog view.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.course.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  if (data.responsibleUserIds) {
    const count = await prisma.user.count({
      where: { id: { in: data.responsibleUserIds }, organizationId: session.organizationId },
    });
    if (count !== data.responsibleUserIds.length) {
      return NextResponse.json({ error: "Responsable introuvable." }, { status: 404 });
    }
  }

  const updated = await prisma.course.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.responsibleUserIds ? { responsibleUsers: { set: data.responsibleUserIds.map((id) => ({ id })) } } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    },
    include: { responsibleUsers: true },
  });

  return NextResponse.json(updated);
}
