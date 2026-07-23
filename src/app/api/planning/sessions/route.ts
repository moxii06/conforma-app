import { NextResponse } from "next/server";
import { z } from "zod";
import { SessionFormat, SessionMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

// ROLLING (bande passante) sessions are always-open — there's no cohort
// date to pick, so startsAt/endsAt are optional from the client and filled
// in server-side with a wide-open placeholder window instead. FIXED_DATE
// keeps the original strict requirement: a real date is the whole point.
const schema = z
  .object({
    courseMode: z.enum(["existing", "new"]),
    courseId: z.string().optional(),
    courseTitle: z.string().optional(),
    trainerId: z.string().optional(),
    mode: z.nativeEnum(SessionMode).default("FIXED_DATE"),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    format: z.nativeEnum(SessionFormat),
    location: z.string().optional(),
    capacity: z.number().int().positive(),
  })
  .refine((d) => (d.courseMode === "existing" ? !!d.courseId : !!d.courseTitle?.trim()), {
    message: "Cours manquant.",
  })
  .refine((d) => d.mode === "ROLLING" || (!!d.startsAt && !!d.endsAt), {
    message: "Dates manquantes.",
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

  let startsAt: Date;
  let endsAt: Date;
  if (data.mode === "ROLLING") {
    startsAt = new Date();
    endsAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  } else {
    startsAt = new Date(data.startsAt!);
    endsAt = new Date(data.endsAt!);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
    }
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
      mode: data.mode,
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
