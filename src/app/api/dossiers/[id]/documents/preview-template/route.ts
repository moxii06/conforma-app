import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate, findEmptyMergeFields, describeMissingFields } from "@/lib/mergeTemplate";
import { resolveAnswers, resolveSubrogatedFunderName, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { computeFundingSummary, resolveDossierPriceCents } from "@/lib/funding";
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

  const [dossier, template, organization] = await Promise.all([
    prisma.dossier.findFirst({
      where: { id: params.id, organizationId: auth.organizationId },
      include: {
        contact: { include: { company: true } },
        session: { include: { course: true } },
        fundingCommitments: { include: { funder: { select: { name: true } } } },
      },
    }),
    prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: auth.organizationId },
      include: { referentHandicapUser: { select: { name: true } } },
    }),
  ]);
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (auth.role === Role.TRAINER && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  let bodyTextSource = template.bodyText;
  // Which variant each conditional question resolved to, for the questions
  // this template actually references — lets the dialog show "✓ Distanciel"
  // style badges explaining why the assembled text reads the way it does.
  let applied: { key: string; value: string }[] = [];
  if (template.blocks.length > 0) {
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: dossier.learnerCategory, agreedPriceCents: dossier.agreedPriceCents },
        session: { format: dossier.session.format },
        course: { priceCents: dossier.session.course.priceCents, certificationCode: dossier.session.course.certificationCode },
        fundingCommitments: dossier.fundingCommitments,
        organization: { withdrawalAccessPolicy: organization.withdrawalAccessPolicy, cancellationFeePercent: organization.cancellationFeePercent },
      },
      manualAnswers,
    );
    const referenced = collectQuestionKeys(template.blocks);
    const stillMissing = referenced.filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      return NextResponse.json({ unresolved: stillMissing.map((k) => QUESTION_BY_KEY[k]), category: template.category });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
    applied = referenced.flatMap((k) => (answers[k] != null ? [{ key: k, value: answers[k] }] : []));
  }

  const fundingSummary = computeFundingSummary(
    resolveDossierPriceCents(dossier, dossier.session.course),
    dossier.fundingCommitments,
  );
  const mergeContext = {
    contact: dossier.contact,
    organization: { ...organization, referentHandicapName: organization.referentHandicapUser?.name ?? null },
    session: { courseTitle: dossier.session.course.title, startsAt: dossier.session.startsAt, location: dossier.session.location },
    dossier: { retentionUntil: dossier.retentionUntil },
    course: dossier.session.course,
    company: dossier.contact.company
      ? {
          name: dossier.contact.company.name,
          siret: dossier.contact.company.siret,
          address: dossier.contact.company.address,
          legalRepresentativeName: dossier.contact.company.legalRepresentativeName,
        }
      : null,
    funder: (() => {
      const name = resolveSubrogatedFunderName(dossier.fundingCommitments);
      return name ? { name } : null;
    })(),
    funding: { totalCents: fundingSummary.totalCents, remainderCents: fundingSummary.remainderCents },
  };
  const bodyText = mergeTemplate(bodyTextSource, mergeContext);

  return NextResponse.json({
    title: `${template.title} — ${dossier.contact.firstName} ${dossier.contact.lastName}`,
    bodyText,
    category: template.category,
    unresolved: [],
    applied,
    // Client feedback: a field the org never filled in used to just vanish
    // from the text — this tells the sender exactly what's missing and
    // where to fix it, without blocking the send (see mergeTemplate.ts).
    missingFields: describeMissingFields(findEmptyMergeFields(bodyTextSource, mergeContext)),
  });
}
