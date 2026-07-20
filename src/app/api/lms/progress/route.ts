import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({
  dossierId: z.string().min(1),
  moduleId: z.string().min(1),
  percentComplete: z.number().int().min(0).max(100),
});

// Every login/lesson/quiz event should be timestamped as Qualiopi evidence
// per spec §5.12 — this scaffold only tracks the percentage + last event
// timestamp on ElearningProgress itself (no separate event log table yet),
// which is enough to show "did they engage recently" but not a full event
// history. A real LMS delivery layer would append individual event rows.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const isOwnDossier = session.role === "LEARNER" && dossier.learnerUserId === session.userId;
  const isStaff = can(session.role, "dossiers") !== "none";
  if (!isOwnDossier && !isStaff) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: parsed.data.moduleId, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });

  const existing = await prisma.elearningProgress.findFirst({
    where: { dossierId: dossier.id, moduleId: module_.id },
  });

  const progress = existing
    ? await prisma.elearningProgress.update({
        where: { id: existing.id },
        data: { percentComplete: parsed.data.percentComplete, lastEventAt: new Date() },
      })
    : await prisma.elearningProgress.create({
        data: {
          dossierId: dossier.id,
          moduleId: module_.id,
          percentComplete: parsed.data.percentComplete,
          lastEventAt: new Date(),
        },
      });

  return NextResponse.json(progress, { status: existing ? 200 : 201 });
}
