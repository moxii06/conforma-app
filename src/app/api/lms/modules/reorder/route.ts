import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  courseId: z.string().min(1),
  orderedModuleIds: z.array(z.string()).min(1),
});

// The dropped position becomes the new `order` (array index) for every
// module in the course — the same field the auto-unlock-next-module logic
// in /api/lms/progress reads from, so a drag-and-drop reorder here changes
// which module actually unlocks next, not just the display order.
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, organizationId: session.organizationId } });
  if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });

  const existing = await prisma.elearningModule.findMany({ where: { courseId: course.id }, select: { id: true } });
  const existingIds = new Set(existing.map((m) => m.id));
  if (parsed.data.orderedModuleIds.length !== existing.length || !parsed.data.orderedModuleIds.every((id) => existingIds.has(id))) {
    return NextResponse.json({ error: "La liste ne correspond pas aux modules de ce cours." }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.orderedModuleIds.map((id, index) => prisma.elearningModule.update({ where: { id }, data: { order: index } }))
  );

  return NextResponse.json({ ok: true });
}
