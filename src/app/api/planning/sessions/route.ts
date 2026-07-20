import { NextResponse } from "next/server";
import { z } from "zod";
import { SessionFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z
  .object({
    courseMode: z.enum(["existing", "new"]),
    courseId: z.string().optional(),
    courseTitle: z.string().optional(),
    trainerId: z.string().optional(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    format: z.nativeEnum(SessionFormat),
    location: z.string().optional(),
    capacity: z.number().int().positive(),
  })
  .refine((d) => (d.courseMode === "existing" ? !!d.courseId : !!d.courseTitle?.trim()), {
    message: "Cours manquant.",
  });

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }

  let courseId: string;
  if (data.courseMode === "existing") {
    const course = await prisma.course.findFirst({
      where: { id: data.courseId, organizationId: session.organizationId },
    });
    if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });
    courseId = course.id;
  } else {
    const created = await prisma.course.create({
      data: { organizationId: session.organizationId, title: data.courseTitle!.trim() },
    });
    courseId = created.id;
  }

  if (data.trainerId) {
    const trainer = await prisma.user.findFirst({
      where: { id: data.trainerId, organizationId: session.organizationId },
    });
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable." }, { status: 404 });
  }

  const created = await prisma.session.create({
    data: {
      organizationId: session.organizationId,
      courseId,
      trainerId: data.trainerId || null,
      startsAt,
      endsAt,
      format: data.format,
      location: data.location,
      capacity: data.capacity,
    },
    include: { course: true, trainer: true },
  });

  return NextResponse.json(created, { status: 201 });
}
