import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { unlockNextModuleIfNeeded, markDossierAccessed } from "@/lib/lms";

const schema = z.object({
  dossierId: z.string().min(1),
  moduleId: z.string().min(1),
  percentComplete: z.number().int().min(0).max(100),
  lastPositionSeconds: z.number().int().min(0).optional(),
});

// Every login/lesson/quiz event should be timestamped as Qualiopi evidence
// per spec §5.12 — this scaffold only tracks the percentage + last event
// timestamp on ElearningProgress itself (no separate event log table yet),
// which is enough to show "did they engage recently" but not a full event
// history. A real LMS delivery layer would append individual event rows.
//
// Creating a row here (vs. updating one) is staff-only — that row IS the
// module assignment (see schema.prisma), so a learner posting progress for
// a module they were never assigned must not silently grant themselves
// access. Assignment happens via POST /api/lms/modules/[id]/assign.
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

  if (!existing && !isStaff) {
    return NextResponse.json({ error: "Ce module ne vous a pas été assigné." }, { status: 403 });
  }

  // Real learner engagement (video playback, a document marked as read) —
  // not staff editing progress by hand — is what starts a rolling dossier's
  // access-duration clock.
  if (isOwnDossier) await markDossierAccessed(dossier.id);

  const wasAlreadyComplete = (existing?.percentComplete ?? 0) >= 100;

  const progress = existing
    ? await prisma.elearningProgress.update({
        where: { id: existing.id },
        // Never regress — a learner rewinding the video shouldn't lower
        // their recorded "furthest point reached," only re-watching past
        // it should. Staff overriding by hand can still set any value.
        data: {
          percentComplete: isStaff ? parsed.data.percentComplete : Math.max(existing.percentComplete, parsed.data.percentComplete),
          lastPositionSeconds: parsed.data.lastPositionSeconds ?? existing.lastPositionSeconds,
          lastEventAt: new Date(),
        },
      })
    : await prisma.elearningProgress.create({
        data: {
          dossierId: dossier.id,
          moduleId: module_.id,
          percentComplete: parsed.data.percentComplete,
          lastPositionSeconds: parsed.data.lastPositionSeconds,
          lastEventAt: new Date(),
          assignedByUserId: session.userId,
          assignedByName: session.name || session.email,
        },
      });

  // Auto-unlock the next module in the course the moment this one is
  // *first* completed — staff still does the initial assignment for a
  // course (so nothing is visible before it's meant to be), but after
  // that a learner shouldn't have to sit and wait for someone on staff to
  // notice and click "assign" for every subsequent module. Only fires on
  // the crossing-into-100 event, not on every save once already there,
  // and only if the next module hasn't already been assigned some other
  // way. "Next" = the next module by `order` (assigned server-side at
  // creation, see /api/lms/modules) — NOT createdAt: a module that
  // existed before that column was added got backfilled to migration
  // time, which can sort *after* modules created later and silently
  // break this lookup.
  if (!wasAlreadyComplete && progress.percentComplete >= 100) {
    await unlockNextModuleIfNeeded({ dossierId: dossier.id, courseId: module_.courseId, currentOrder: module_.order });
  }

  return NextResponse.json(progress, { status: existing ? 200 : 201 });
}
