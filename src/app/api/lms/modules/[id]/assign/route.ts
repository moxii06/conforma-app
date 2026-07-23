import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ dossierIds: z.array(z.string().min(1)).min(1) });

// Grants access to a module — creates the ElearningProgress row that IS
// the assignment (see schema.prisma comment). Staff-only: a learner can no
// longer trigger their own access by posting a progress update for a
// module they were never assigned (see /api/lms/progress). Only dossiers
// belonging to a session of the module's own course are accepted, and
// already-assigned dossiers are silently skipped rather than erroring.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: auth.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Sélection invalide." }, { status: 400 });

  const eligibleDossiers = await prisma.dossier.findMany({
    where: {
      id: { in: parsed.data.dossierIds },
      organizationId: auth.organizationId,
      session: { courseId: module_.courseId },
    },
    select: { id: true },
  });

  const existing = await prisma.elearningProgress.findMany({
    where: { moduleId: module_.id, dossierId: { in: eligibleDossiers.map((d) => d.id) } },
    select: { dossierId: true },
  });
  const alreadyAssigned = new Set(existing.map((e) => e.dossierId));
  const toAssign = eligibleDossiers.filter((d) => !alreadyAssigned.has(d.id));

  if (toAssign.length > 0) {
    await prisma.elearningProgress.createMany({
      data: toAssign.map((d) => ({
        dossierId: d.id,
        moduleId: module_.id,
        assignedByUserId: auth.userId,
        assignedByName: auth.name || auth.email,
      })),
    });
  }

  return NextResponse.json({ assigned: toAssign.length, alreadyAssigned: alreadyAssigned.size });
}
