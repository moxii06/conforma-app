import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ title: z.string().min(1) });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const chapter = await prisma.chapter.findFirst({ where: { id: params.id, course: { organizationId: session.organizationId } } });
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const updated = await prisma.chapter.update({ where: { id: chapter.id }, data: { title: parsed.data.title } });
  return NextResponse.json(updated);
}

// A chapter is a label, not a container with semantic weight of its own —
// deleting it detaches its modules (chapterId → null, back to "Sans
// chapitre") rather than deleting them or blocking the request.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const chapter = await prisma.chapter.findFirst({ where: { id: params.id, course: { organizationId: session.organizationId } } });
  if (!chapter) return NextResponse.json({ error: "Chapitre introuvable." }, { status: 404 });

  await prisma.$transaction([
    prisma.elearningModule.updateMany({ where: { chapterId: chapter.id }, data: { chapterId: null } }),
    prisma.chapter.delete({ where: { id: chapter.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
