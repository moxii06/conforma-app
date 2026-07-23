import { NextResponse } from "next/server";
import { z } from "zod";
import { SessionFormat, SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  trainerId: z.string().nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  format: z.nativeEnum(SessionFormat).optional(),
  location: z.string().nullable().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
});

// Single PATCH for both "edit the session's details" (date/trainer/format/
// location/capacity, while it's still DRAFT and being put together) and
// "validate it" (status: DRAFT -> VALIDATED, the point at which the
// Planning detail page starts prompting to send convocations) — both are
// just Session field updates, no need for two routes.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const existing = await prisma.session.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!existing) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });
  const data = parsed.data;

  const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
  const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }

  if (data.trainerId) {
    const trainer = await prisma.user.findFirst({ where: { id: data.trainerId, organizationId: auth.organizationId } });
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable." }, { status: 404 });
  }

  const updated = await prisma.session.update({
    where: { id: existing.id },
    data: {
      ...(data.trainerId !== undefined ? { trainerId: data.trainerId } : {}),
      ...(data.startsAt ? { startsAt } : {}),
      ...(data.endsAt ? { endsAt } : {}),
      ...(data.format ? { format: data.format } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.capacity ? { capacity: data.capacity } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
    include: { course: true, trainer: true },
  });

  return NextResponse.json(updated);
}
