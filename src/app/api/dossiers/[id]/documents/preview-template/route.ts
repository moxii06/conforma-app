import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { resolveAnswers, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { Role } from "@prisma/client";

// Merges a template against this dossier's contact/session WITHOUT
// persisting anything — backs the "Envoyer un document" dialog's live
// preview as staff switch between templates, before they've decided to
// send (and possibly edit the text first). Contrast with
// /api/documents/generate, which creates the Document immediately.
//
// For a conditional template (blocks), an optional `answers` query param
// (JSON-encoded) carries manual answers for whatever the dossier's own data
// can't resolve — the dialog re-calls this route once staff has filled in
// the short questionnaire it shows when `unresolved` comes back non-empty.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId");
  if (!templateId) return NextResponse.json({ error: "templateId requis." }, { status: 400 });
  let manualAnswers: Partial<Record<QuestionKey, string>> | undefined;
  const answersRaw = url.searchParams.get("answers");
  if (answersRaw) {
    try {
      manualAnswers = JSON.parse(answersRaw);
    } catch {
      return NextResponse.json({ error: "Paramètre answers invalide." }, { status: 400 });
    }
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } }, fundingCommitments: true },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  let bodyTextSource = template.bodyText;
  if (template.blocks.length > 0) {
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: dossier.learnerCategory, agreedPriceCents: dossier.agreedPriceCents },
        session: { format: dossier.session.format },
        course: { priceCents: dossier.session.course.priceCents },
        fundingCommitments: dossier.fundingCommitments,
      },
      manualAnswers,
    );
    const stillMissing = collectQuestionKeys(template.blocks).filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      return NextResponse.json({ unresolved: stillMissing.map((k) => QUESTION_BY_KEY[k]), category: template.category });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const bodyText = mergeTemplate(bodyTextSource, {
    contact: dossier.contact,
    organization,
    session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
    dossier: { retentionUntil: dossier.retentionUntil },
    course: dossier.session.course,
  });

  return NextResponse.json({
    title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
    bodyText,
    category: template.category,
    unresolved: [],
  });
}
