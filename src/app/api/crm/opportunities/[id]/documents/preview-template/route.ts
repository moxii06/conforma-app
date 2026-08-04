import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";
import { mergeTemplate, findEmptyMergeFields, describeMissingFields } from "@/lib/mergeTemplate";
import { resolveAnswers, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";

// Opportunity-level counterpart to /api/dossiers/[id]/documents/preview-template
// — a prospect doesn't have a Dossier (or a session) yet, so this merges
// against the Contact only; every session.* merge field resolves to "".
//
// Audit P1 : les modèles à blocs conditionnels (contrat, convention) sont
// désormais générables depuis le CRM aussi — même mécanique answers/
// unresolved que la route dossier, avec un contexte prospect : pas de
// session (format → question posée), pas de financement enregistré
// (subrogation → « non »), catégorie depuis le contact, prix depuis le
// montant de l'opportunité.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
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

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: { include: { company: true } }, courseOfInterest: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
    include: { course: true, blocks: { orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    include: { referentHandicapUser: { select: { name: true } } },
  });

  const course = template.course ?? opportunity.courseOfInterest;
  let bodyTextSource = template.bodyText;
  let applied: { key: string; value: string }[] = [];
  if (template.blocks.length > 0) {
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: opportunity.contact.defaultLearnerCategory, agreedPriceCents: opportunity.amountCents },
        session: { format: null },
        course: { priceCents: course?.priceCents ?? null, certificationCode: course?.certificationCode ?? null },
        fundingCommitments: [],
        organization: {
          withdrawalAccessPolicy: organization.withdrawalAccessPolicy,
          cancellationFeePercent: organization.cancellationFeePercent,
        },
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

  // No real session yet at the prospect stage — {{session.startsAt}} is left
  // blank rather than filled with a fake date (mergeTemplate treats a
  // missing session as "" for every session.* field, courseTitle included).
  const mergeContext = {
    contact: opportunity.contact,
    organization: { ...organization, referentHandicapName: organization.referentHandicapUser?.name ?? null },
    session: null,
    course,
    company: opportunity.contact.company
      ? {
          name: opportunity.contact.company.name,
          siret: opportunity.contact.company.siret,
          address: opportunity.contact.company.address,
          legalRepresentativeName: opportunity.contact.company.legalRepresentativeName,
        }
      : null,
  };
  const bodyText = mergeTemplate(bodyTextSource, mergeContext);

  return NextResponse.json({
    title: `${template.title} — ${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
    bodyText,
    category: template.category,
    unresolved: [],
    applied,
    missingFields: describeMissingFields(findEmptyMergeFields(bodyTextSource, mergeContext)),
  });
}
