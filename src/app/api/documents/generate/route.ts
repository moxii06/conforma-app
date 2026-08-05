import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate, findEmptyMergeFields, describeMissingFields } from "@/lib/mergeTemplate";
import { resolveAnswers, resolveSubrogatedFunderName, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { computeFundingSummary, resolveDossierPriceCents } from "@/lib/funding";
import { templateAppliesToCourse, TEMPLATE_WRONG_COURSE } from "@/lib/templateScope";

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
      include: {
        contact: { include: { company: true } },
        session: { include: { course: true } },
        fundingCommitments: { include: { funder: { select: { name: true } } } },
      },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
      include: { referentHandicapUser: { select: { name: true } } },
    }),
  ]);

  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  // Le garde-fou qui rend la règle réelle. Les écrans ne proposent plus les
  // modèles d'une autre formation, mais un identifiant de modèle arrive ici
  // dans le corps d'une requête : rien n'oblige un appelant à l'avoir pris
  // dans la liste qu'on lui a montrée. Une convention générée sur la mauvaise
  // formation porterait un titre, une durée et un prix faux — et le document
  // ne dirait nulle part qu'il s'est trompé.
  if (!templateAppliesToCourse(template, dossier.session.courseId)) {
    return NextResponse.json({ error: TEMPLATE_WRONG_COURSE }, { status: 400 });
  }

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
        course: { priceCents: dossier.session.course.priceCents, certificationCode: dossier.session.course.certificationCode },
        fundingCommitments: dossier.fundingCommitments,
        organization: { withdrawalAccessPolicy: organization.withdrawalAccessPolicy, cancellationFeePercent: organization.cancellationFeePercent },
      },
      parsed.data.answers as Partial<Record<QuestionKey, string>> | undefined,
    );
    const stillMissing = collectQuestionKeys(template.blocks).filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      return NextResponse.json({ unresolved: stillMissing.map((k) => QUESTION_BY_KEY[k]) }, { status: 409 });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
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
  const merged = mergeTemplate(bodyTextSource, mergeContext);

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

  // Non-blocking: the document is created either way (see mergeTemplate.ts's
  // comment on why this warns instead of refusing) — the caller decides
  // whether to surface it.
  const missingFields = describeMissingFields(findEmptyMergeFields(bodyTextSource, mergeContext));

  return NextResponse.json({ ...document, missingFields }, { status: 201 });
}
