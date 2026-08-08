import { NextResponse } from "next/server";
import { z } from "zod";
import { SessionFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  format: z.nativeEnum(SessionFormat),
  location: z.string().max(300).optional(),
});

// Called from the contract-send flow when the dossier sits on a ROLLING
// (en continu) session and the OFP wants real dates in the contract: one
// step creates a FIXED_DATE session on the same course (carrying over
// trainer/capacity) AND moves the dossier onto it, so the session.* merge
// fields resolve immediately. Two separate calls (create, then relink)
// could leave a dossier stranded between them — hence one endpoint, one
// transaction. The new session lands as a Planning draft (SessionStatus
// default), exactly like one created from the Planning page.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { session: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const startsAt = new Date(`${parsed.data.date}T${parsed.data.startTime}`);
  const endsAt = new Date(`${parsed.data.date}T${parsed.data.endTime}`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }

  const [created] = await prisma.$transaction(async (tx) => {
    const newSession = await tx.session.create({
      data: {
        organizationId: session.organizationId,
        courseId: dossier.session.courseId,
        mode: "FIXED_DATE",
        trainerId: dossier.session.trainerId,
        startsAt,
        endsAt,
        format: parsed.data.format,
        location: parsed.data.location || null,
        capacity: dossier.session.capacity,
      },
    });
    await tx.dossier.update({ where: { id: dossier.id }, data: { sessionId: newSession.id } });
    return [newSession];
  });

  return NextResponse.json(created, { status: 201 });
}
