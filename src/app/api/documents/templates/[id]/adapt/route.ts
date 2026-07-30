import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplatePartial } from "@/lib/mergeTemplate";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { generateDocxFromRichText } from "@/lib/htmlToDocx";

const schema = z.object({
  answers: z.record(z.string()).optional(),
  format: z.enum(["text", "docx", "pdf"]),
});

// Assembles a template AT TEMPLATE LEVEL — no dossier involved. Unlike
// /api/documents/generate, nothing can be auto-resolved here (every
// resolver reads dossier/session data that doesn't exist yet), so every
// question the template's blocks branch on must arrive as a manual answer;
// missing ones come back as 409 + the question definitions, same contract
// as the generate route so the dialog logic is interchangeable. The output
// is a BASE document: organisation fields filled, learner/session tokens
// left visible for later — see mergeTemplatePartial.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const [template, organization] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: { id: params.id, OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
  ]);
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  let bodyTextSource = template.bodyText;
  if (template.blocks.length > 0) {
    const answers = (parsed.data.answers ?? {}) as Partial<Record<QuestionKey, string>>;
    const needed = collectQuestionKeys(template.blocks);
    const missing = needed.filter((k) => {
      const value = answers[k];
      return !value || !QUESTION_BY_KEY[k].options.some((o) => o.value === value);
    });
    if (missing.length > 0) {
      return NextResponse.json({ unresolved: missing.map((k) => QUESTION_BY_KEY[k]) }, { status: 409 });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
  }

  const merged = mergeTemplatePartial(bodyTextSource, {
    contact: { firstName: "", lastName: "", email: "", phone: null },
    organization,
  });

  if (parsed.data.format === "text") {
    return NextResponse.json({ title: template.title, bodyText: merged });
  }

  const html = plainTextToHtml(merged);
  const isDocx = parsed.data.format === "docx";
  const bytes = isDocx
    ? await generateDocxFromRichText(template.title, html)
    : await generatePdfFromRichText(template.title, html);
  const ext = isDocx ? "docx" : "pdf";
  const contentType = isDocx
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";

  // Same Latin-1 vs UTF-8 filename dance as /api/documents/generated/[id].
  const asciiFallback = template.title.replace(/[^\x20-\x7E]/g, "_");
  const utf8Name = encodeURIComponent(`${template.title}.${ext}`);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback}.${ext}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
