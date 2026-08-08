import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { uploadModuleFile } from "@/lib/storage";
import { sanitizeRichText } from "@/lib/richText";

const fieldsSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  // "page" — rich-text-only content, no file (see ElearningModule.type).
  type: z.enum(["video", "document", "quiz", "page"]),
  chapterId: z.string().optional(),
});

// Multipart, not JSON — a real file (video/PDF/document) rides along with
// the module's metadata. See src/lib/storage.ts for where it actually
// lands (Vercel Blob) and NewModuleForm.tsx for the upload form.
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "planning") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const parsed = fieldsSchema.safeParse({
    courseId: form.get("courseId"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    type: form.get("type"),
    chapterId: form.get("chapterId") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const course = await prisma.course.findFirst({
    where: { id: parsed.data.courseId, organizationId: session.organizationId },
  });
  if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });

  if (parsed.data.chapterId) {
    const chapter = await prisma.chapter.findFirst({ where: { id: parsed.data.chapterId, courseId: course.id } });
    if (!chapter) return NextResponse.json({ error: "Chapitre introuvable." }, { status: 404 });
  }

  // order is assigned server-side (next slot in this course), never
  // client-supplied — it's what "next module after this one" (the
  // auto-unlock-on-completion logic in /api/lms/progress) actually keys
  // off of. Deliberately not createdAt: a module that existed before the
  // column was added got backfilled to whatever moment the migration ran,
  // which can land *after* modules created post-migration — a real
  // ordering bug this avoids by using a value only ever set here.
  const moduleCount = await prisma.elearningModule.count({ where: { courseId: course.id } });

  // A module created into a chapter slots in right after that chapter's
  // current last module (shifting everything below by one) instead of
  // appending at the end of the course — appending would split the chapter
  // into two visual runs whenever unrelated modules already sit after it.
  // Same reindexing the reorder endpoint performs, just server-decided.
  let order = moduleCount;
  if (parsed.data.chapterId) {
    const lastInChapter = await prisma.elearningModule.findFirst({
      where: { courseId: course.id, chapterId: parsed.data.chapterId },
      orderBy: { order: "desc" },
    });
    if (lastInChapter && lastInChapter.order < moduleCount - 1) {
      order = lastInChapter.order + 1;
    }
  }

  const [, module_] = await prisma.$transaction([
    prisma.elearningModule.updateMany({
      where: { courseId: course.id, order: { gte: order } },
      data: { order: { increment: 1 } },
    }),
    prisma.elearningModule.create({
      data: {
        courseId: course.id,
        title: parsed.data.title,
        description: parsed.data.description ? sanitizeRichText(parsed.data.description) : undefined,
        type: parsed.data.type,
        chapterId: parsed.data.chapterId,
        order,
      },
    }),
  ]);

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
