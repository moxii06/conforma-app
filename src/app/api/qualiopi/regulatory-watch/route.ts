import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  watchType: z.enum(["legal", "metiers_competences", "pedagogique_technologique", "reseaux_partenariats"]),
  source: z.string().min(1),
  watchDate: z.string(),
  summary: z.string().min(1),
  ownerName: z.string().min(1),
  affectedCourseIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "qualiopi") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const watchDate = new Date(parsed.data.watchDate);
  if (Number.isNaN(watchDate.getTime())) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  if (parsed.data.affectedCourseIds?.length) {
    const count = await prisma.course.count({ where: { id: { in: parsed.data.affectedCourseIds }, organizationId: session.organizationId } });
    if (count !== parsed.data.affectedCourseIds.length) {
      return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
    }
  }

  const item = await prisma.regulatoryWatch.create({
    data: {
      organizationId: session.organizationId,
      watchType: parsed.data.watchType,
      source: parsed.data.source,
      watchDate,
      summary: parsed.data.summary,
      ownerName: parsed.data.ownerName,
      createdByName: session.name || session.email,
      affectedCourses: parsed.data.affectedCourseIds?.length
        ? { connect: parsed.data.affectedCourseIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
