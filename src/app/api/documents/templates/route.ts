import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { DOCUMENT_CATEGORIES } from "@/lib/documentCategories";

const schema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().min(1),
  bodyText: z.string().min(1),
  courseId: z.string().optional(),
});

// The library panel (LibraryPanel) opens over whatever screen the user is on
// and has to reflect a template they just adapted or created, without a page
// reload — every other consumer gets its templates as server props, which is
// fine for a page render but cannot refresh in place.
//
// `origin` is what lets the panel group the list the way the Bibliothèque
// page does (Jalon's own vs the organization's), without leaking the raw
// organizationId to the client.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const templates = await prisma.documentTemplate.findMany({
    where: { OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
    select: {
      id: true,
      title: true,
      category: true,
      organizationId: true,
      forkedFromId: true,
      courseId: true,
      course: { select: { title: true } },
      _count: { select: { blocks: true } },
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      origin: t.organizationId === null ? ("jalon" as const) : ("organization" as const),
      forkedFromId: t.forkedFromId,
      courseTitle: t.course?.title ?? null,
      // Presence, not the paragraphs themselves: the panel only needs to
      // badge a template as conditional and decide which editor to open.
      // The blocks are fetched by that editor when it actually opens.
      conditional: t._count.blocks > 0,
    })),
    // Which Jalon templates this org has already adapted, so the panel can
    // show "Déjà adapté" instead of offering a fork that would no-op.
    forkedFrom: templates.filter((t) => t.forkedFromId).map((t) => t.forkedFromId as string),
  });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  if (parsed.data.courseId) {
    const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, organizationId: session.organizationId } });
    if (!course) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  }

  const template = await prisma.documentTemplate.create({
    data: { organizationId: session.organizationId, ...parsed.data },
  });

  return NextResponse.json(template, { status: 201 });
}
