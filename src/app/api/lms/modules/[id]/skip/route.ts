import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { unlockNextModuleIfNeeded, markDossierAccessed } from "@/lib/lms";

const schema = z.object({ dossierId: z.string().min(1) });

// Learner-only — "Passer cette vidéo" (Course.allowVideoSkip). Marks the
// module done (percentComplete: 100, same effect as really finishing it —
// see unlockNextModuleIfNeeded) but stamps ElearningProgress.skippedAt so
// the UI shows it as an unearned completion rather than a genuine one. See
// that field's own comment for how a later real watch-through clears it.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== "LEARNER") {
    return NextResponse.json({ error: "Action réservée aux apprenants." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId, learnerUserId: session.userId },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
    include: { course: { select: { id: true, allowVideoSkip: true } } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });
  if (module_.type !== "video") return NextResponse.json({ error: "Seuls les modules vidéo peuvent être passés." }, { status: 400 });
  if (!module_.course.allowVideoSkip) {
    return NextResponse.json({ error: "Cette formation n'autorise pas à passer les vidéos." }, { status: 403 });
  }

  const existing = await prisma.elearningProgress.findFirst({ where: { dossierId: dossier.id, moduleId: module_.id } });
  if (!existing) return NextResponse.json({ error: "Ce module ne vous a pas été assigné." }, { status: 403 });
  if (existing.percentComplete >= 100) return NextResponse.json({ error: "Ce module est déjà terminé." }, { status: 400 });

  await markDossierAccessed(dossier.id);

  await prisma.elearningProgress.update({
    where: { id: existing.id },
    data: { percentComplete: 100, skippedAt: new Date(), lastEventAt: new Date() },
  });

  await unlockNextModuleIfNeeded({ dossierId: dossier.id, courseId: module_.course.id });

  return NextResponse.json({ skipped: true });
}
