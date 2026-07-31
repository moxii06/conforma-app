import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ."),
  morningHours: z.number().min(0).max(12).nullable(),
  afternoonHours: z.number().min(0).max(12).nullable(),
});

const bodySchema = z.object({ days: z.array(daySchema).max(60) });

// Replaces a session's days wholesale rather than diffing them: they have no
// stable identity worth preserving (a date plus two numbers), and staff edit
// them as a block — "this training runs these 3 days" — not one at a time.
//
// The one thing that DOES need protecting is signatures already collected, so
// a day that still has attendance can't be dropped silently.
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const session = await prisma.session.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { days: { include: { _count: { select: { attendance: true } } } } },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
  }

  const incomingDates = new Set(parsed.data.days.map((d) => d.date));
  const signedDayBeingRemoved = session.days.find(
    (d) => d._count.attendance > 0 && !incomingDates.has(d.date.toISOString().slice(0, 10)),
  );
  if (signedDayBeingRemoved) {
    return NextResponse.json(
      {
        error:
          "Une journée déjà émargée ne peut pas être supprimée — les signatures recueillies sont des preuves d'audit.",
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.sessionDay.deleteMany({ where: { sessionId: session.id, attendance: { none: {} } } }),
    ...parsed.data.days.map((d, i) =>
      prisma.sessionDay.upsert({
        // No natural unique key on (sessionId, date) — matching by id would
        // need the client to track them, so an existing row for that date is
        // found first and updated in place.
        where: {
          id:
            session.days.find((existing) => existing.date.toISOString().slice(0, 10) === d.date)?.id ??
            `nouveau-${session.id}-${d.date}`,
        },
        create: {
          sessionId: session.id,
          date: new Date(`${d.date}T00:00:00.000Z`),
          morningHours: d.morningHours,
          afternoonHours: d.afternoonHours,
          order: i,
        },
        update: { morningHours: d.morningHours, afternoonHours: d.afternoonHours, order: i },
      }),
    ),
  ]);

  const days = await prisma.sessionDay.findMany({ where: { sessionId: session.id }, orderBy: { order: "asc" } });
  return NextResponse.json({ days });
}
