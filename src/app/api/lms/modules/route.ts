import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { uploadModuleFile } from "@/lib/storage";

const fieldsSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["video", "document", "quiz"]),
});

// Multipart, not JSON — a real file (video/PDF/document) rides along with
// the module's metadata. See src/lib/storage.ts for where it actually
// lands (Vercel Blob) and NewModuleForm.tsx for the upload form.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const parsed = fieldsSchema.safeParse({
    courseId: form.get("courseId"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    type: form.get("type"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: { id: parsed.data.courseId, organizationId: session.organizationId },
  });
  if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });

  // order is assigned server-side (next slot in this course), never
  // client-supplied — it's what "next module after this one" (the
  // auto-unlock-on-completion logic in /api/lms/progress) actually keys
  // off of. Deliberately not createdAt: a module that existed before the
  // column was added got backfilled to whatever moment the migration ran,
  // which can land *after* modules created post-migration — a real
  // ordering bug this avoids by using a value only ever set here.
  const moduleCount = await prisma.elearningModule.count({ where: { courseId: course.id } });

  const module_ = await prisma.elearningModule.create({
    data: {
      courseId: course.id,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      order: moduleCount,
    },
  });

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      const uploaded = await uploadModuleFile({ organizationId: session.organizationId, moduleId: module_.id, file });
      const updated = await prisma.elearningModule.update({
        where: { id: module_.id },
        data: { fileUrl: uploaded.url, fileName: uploaded.fileName, fileSizeBytes: uploaded.sizeBytes },
      });
      return NextResponse.json(updated, { status: 201 });
    } catch (err) {
      // The module itself was created successfully — only the file upload
      // failed. Report the upload error but leave the module in place
      // (fileUrl null) rather than losing the title/description/type the
      // user just filled in; they can retry the upload via PATCH later.
      return NextResponse.json(
        { ...module_, uploadError: err instanceof Error ? err.message : "Erreur d'upload inattendue." },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(module_, { status: 201 });
}
