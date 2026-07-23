import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { uploadModuleFile } from "@/lib/storage";

// Replacing a video/document a learner has already made progress against
// silently invalidates that progress — their recorded percentComplete
// refers to a position in the file being removed, which may not mean
// anything in the new one (a re-cut video, a longer document...). Unlike a
// fresh module (no progress exists yet, nothing to invalidate), this path
// requires the caller to pass `confirm=true` once told that learners are
// mid-progress, rather than swapping the file silently.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });
  if (module_.type === "quiz") return NextResponse.json({ error: "Un quiz n'a pas de fichier à remplacer." }, { status: 400 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }
  const confirm = form.get("confirm") === "true";

  const progressCount = await prisma.elearningProgress.count({
    where: { moduleId: module_.id, percentComplete: { gt: 0 } },
  });
  if (progressCount > 0 && !confirm) {
    return NextResponse.json(
      {
        requiresConfirmation: true,
        progressCount,
        error: `${progressCount} apprenant(s) ont déjà une progression enregistrée sur ce module — la remplacer invalidera leur suivi.`,
      },
      { status: 409 }
    );
  }

  let uploaded: { url: string; fileName: string; sizeBytes: number };
  try {
    uploaded = await uploadModuleFile({ organizationId: session.organizationId, moduleId: module_.id, file });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur d'upload." }, { status: 502 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (module_.fileUrl) {
      await tx.elearningModuleVersion.create({
        data: {
          moduleId: module_.id,
          fileUrl: module_.fileUrl,
          fileName: module_.fileName,
          fileSizeBytes: module_.fileSizeBytes,
          replacedByName: session.name || session.email,
        },
      });
    }
    return tx.elearningModule.update({
      where: { id: module_.id },
      data: { fileUrl: uploaded.url, fileName: uploaded.fileName, fileSizeBytes: uploaded.sizeBytes },
    });
  });

  return NextResponse.json(updated);
}
