import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { uploadModuleFile } from "@/lib/storage";

// Supplementary files alongside a module's primary content (e.g. a slide
// deck next to a video) — see ElearningModuleAttachment in schema.prisma.
// Reuses uploadModuleFile as-is: same org/module-namespaced Blob path as
// the module's own primary file, just a separate DB row per attachment.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const module_ = await prisma.elearningModule.findFirst({
    where: { id: params.id, course: { organizationId: session.organizationId } },
  });
  if (!module_) return NextResponse.json({ error: "Module introuvable." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }
  const title = (form.get("title") as string | null)?.trim() || file.name;

  let uploaded: { url: string; fileName: string; sizeBytes: number };
  try {
    uploaded = await uploadModuleFile({ organizationId: session.organizationId, moduleId: module_.id, file });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur d'upload." }, { status: 502 });
  }

  const attachment = await prisma.elearningModuleAttachment.create({
    data: {
      moduleId: module_.id,
      title,
      fileUrl: uploaded.url,
      fileName: uploaded.fileName,
      fileSizeBytes: uploaded.sizeBytes,
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}
