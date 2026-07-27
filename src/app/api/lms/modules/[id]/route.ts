import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { deleteModuleFile } from "@/lib/storage";
import { sanitizeRichText } from "@/lib/richText";

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  order: z.number().int().optional(),
  // null = detach from any chapter ("Sans chapitre").
  chapterId: z.string().nullable().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.chapterId) {
    const chapter = await prisma.chapter.findFirst({ where: { id: parsed.data.chapterId, courseId: module_.courseId } });
    if (!chapter) return NextResponse.json({ error: "Chapitre introuvable." }, { status: 404 });
  }

  const updated = await prisma.elearningModule.update({
    where: { id: module_.id },
    data: {
      ...parsed.data,
      description: parsed.data.description != null ? sanitizeRichText(parsed.data.description) : parsed.data.description,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });

  await prisma.$transaction([
    prisma.elearningProgress.deleteMany({ where: { moduleId: module_.id } }),
    prisma.elearningModule.delete({ where: { id: module_.id } }),
  ]);

  if (module_.fileUrl) await deleteModuleFile(module_.fileUrl);

  return NextResponse.json({ ok: true });
}
