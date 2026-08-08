import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { QUESTION_BY_KEY } from "@/lib/documentQuestionnaire";

const blockSchema = z.object({
  bodyText: z.string().min(1),
  conditions: z
    .array(
      z.object({
        questionKey: z.string().refine((k) => k in QUESTION_BY_KEY, { message: "Question inconnue." }),
        in: z.array(z.string()).min(1),
      }),
    )
    .nullable(),
});
const schema = z.object({ blocks: z.array(blockSchema).max(50) });

// Bulk replace-all rather than per-block CRUD: a template's block list is a
// handful of clauses always edited as a whole from the Bibliothèque's block
// editor (TemplateBlocksEditor) — no client-side block ids to reconcile
// across saves, and `order` is just the array position.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  // Same rule as PATCH /api/documents/templates/[id]: a global starter
  // template (organizationId: null) stays read-only in place — an org
  // forks it first (see /fork) and edits blocks on their own copy.
  const template = await prisma.documentTemplate.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.documentTemplateBlock.deleteMany({ where: { templateId: template.id } });
    if (parsed.data.blocks.length > 0) {
      await tx.documentTemplateBlock.createMany({
        data: parsed.data.blocks.map((b, i) => ({
          templateId: template.id,
          order: i,
          bodyText: b.bodyText,
          conditions: b.conditions ?? Prisma.JsonNull,
        })),
      });
    }
  });

  const blocks = await prisma.documentTemplateBlock.findMany({
    where: { templateId: template.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ blocks });
}
