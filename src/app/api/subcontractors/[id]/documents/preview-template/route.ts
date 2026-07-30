import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { resolveAnswers, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { SessionFormat } from "@prisma/client";

// Subcontractor-level counterpart to /api/dossiers/[id]/documents/preview-template
// — a Subcontractor has no dossier, session or course, so those merge
// fields are simply never referenced by a subcontractor-facing template
// (formateur contract, tournage vidéo...). Unlike the CRM prospect route,
// this DOES resolve conditional blocks: the two subcontractor templates are
// built entirely out of them.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "team") !== "full") {
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

  const [subcontractor, template, organization] = await Promise.all([
    prisma.subcontractor.findFirst({ where: { id: params.id, organizationId: auth.organizationId } }),
    prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }),
  ]);
  if (!subcontractor) return NextResponse.json({ error: "Sous-traitant introuvable." }, { status: 404 });
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  let bodyTextSource = template.bodyText;
  if (template.blocks.length > 0) {
    // No dossier/session/course exists for a subcontractor document — every
    // question that depends on one (statutApprenant, modalite, subrogation...)
    // is structurally irrelevant here and never referenced by a
    // subcontractor-facing template's own blocks (collectQuestionKeys only
    // looks at the keys THIS template actually uses), so a neutral context
    // is safe: organization is the one real dependency worth passing through.
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: null, agreedPriceCents: null },
        session: { format: SessionFormat.IN_PERSON },
        course: { priceCents: null, certificationCode: null },
        fundingCommitments: [],
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
  }

  const bodyText = mergeTemplate(bodyTextSource, {
    contact: { firstName: subcontractor.name, lastName: "", email: subcontractor.contactEmail ?? "", phone: subcontractor.contactPhone },
    organization,
    subcontractor: {
      name: subcontractor.name,
      siret: subcontractor.siret,
      address: subcontractor.address,
      contractStartDate: subcontractor.contractStartDate,
      contractEndDate: subcontractor.contractEndDate,
    },
  });

  return NextResponse.json({
    title: `${template.title} — ${subcontractor.name}`,
    bodyText,
    category: template.category,
    unresolved: [],
  });
}
