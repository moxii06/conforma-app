import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { resolveAnswers, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";

const schema = z.object({
  templateId: z.string().min(1),
  dossierId: z.string().min(1),
  // Manual answers for questions the dossier's own data can't resolve —
  // only used when the template has conditional blocks (see below).
  answers: z.record(z.string()).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const [template, dossier, organization] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: {
        id: parsed.data.templateId,
        OR: [{ organizationId: session.organizationId }, { organizationId: null }],
      },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.dossier.findFirst({
      where: { id: parsed.data.dossierId, organizationId: session.organizationId },
      include: { contact: true, session: { include: { course: true } }, fundingCommitments: true },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
  ]);

  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  // A conditional template (blocks.length > 0) replaces bodyText entirely —
  // see the DocumentTemplate.blocks schema comment. Unresolved-and-needed
  // questions block generation with 409 rather than guessing; the caller
  // (GenerateDocumentButton) re-POSTs with `answers` once staff has filled
  // them in.
  let bodyTextSource = template.bodyText;
  if (template.blocks.length > 0) {
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: dossier.learnerCategory, agreedPriceCents: dossier.agreedPriceCents },
        session: { format: dossier.session.format },
        course: { priceCents: dossier.session.course.priceCents },
        fundingCommitments: dossier.fundingCommitments,
      },
      parsed.data.answers as Partial<Record<QuestionKey, string>> | undefined,
    );
    const stillMissing = collectQuestionKeys(template.blocks).filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      return NextResponse.json({ unresolved: stillMissing.map((k) => QUESTION_BY_KEY[k]) }, { status: 409 });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
  }

  const merged = mergeTemplate(bodyTextSource, {
    contact: dossier.contact,
    organization,
    session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
    dossier: { retentionUntil: dossier.retentionUntil },
    course: dossier.session.course,
  });

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      dossierId: dossier.id,
      title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
      bodyText: merged,
      templateOrigin: template.title,
      category: template.category,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
