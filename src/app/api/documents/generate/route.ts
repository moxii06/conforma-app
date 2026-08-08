import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate, findEmptyMergeFields, describeMissingFields } from "@/lib/mergeTemplate";
import {
  resolveAnswers,
  resolveSubrogatedFunderName,
  proposerReportsFormation,
  QUESTION_BY_KEY,
  type QuestionKey,
} from "@/lib/documentQuestionnaire";
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
  if (can(session.roles, "toolkit") === "none") {
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
        session: {
          include: {
            course: true,
            // Les ateliers non annulés : c'est ce qui répond « oui » à la
            // question des temps collectifs. Chargés en lignes plutôt qu'en
            // _count filtré, quelques-uns par session au plus.
            ateliers: { where: { annuleeAt: null }, select: { id: true } },
          },
        },
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
  // Quelle variante chaque question référencée a résolue — auto ou saisie,
  // sans distinction ici, exactement comme preview-template. C'est ce qui
  // permet à l'écran de proposer « Modifier les réponses » après coup : les
  // mêmes clés, rejouées comme réponses manuelles, régénèrent un document
  // corrigé sans qu'il faille deviner lesquelles avaient été demandées.
  let applied: { key: string; value: string }[] = [];
  if (template.blocks.length > 0) {
    const { answers, unresolved } = resolveAnswers(
      {
        dossier: { learnerCategory: dossier.learnerCategory, agreedPriceCents: dossier.agreedPriceCents },
        session: {
          format: dossier.session.format,
          withdrawalAccessPolicy: dossier.session.withdrawalAccessPolicy,
          contractSigningMode: dossier.session.contractSigningMode,
          ateliersCount: dossier.session.ateliers.length,
        },
        course: {
          priceCents: dossier.session.course.priceCents,
          certificationCode: dossier.session.course.certificationCode,
          withdrawalAccessPolicy: dossier.session.course.withdrawalAccessPolicy,
        },
        contact: { birthDate: dossier.contact.birthDate },
        fundingCommitments: dossier.fundingCommitments,
        organization: { withdrawalAccessPolicy: organization.withdrawalAccessPolicy, cancellationFeePercent: organization.cancellationFeePercent },
      },
      parsed.data.answers as Partial<Record<QuestionKey, string>> | undefined,
    );
    const referenced = collectQuestionKeys(template.blocks);
    const stillMissing = referenced.filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      return NextResponse.json({ unresolved: stillMissing.map((k) => QUESTION_BY_KEY[k]) }, { status: 409 });
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

  // Ce que la saisie du questionnaire apprend à la fiche formation. Proposé
  // seulement à qui peut réellement modifier une formation : montrer la
  // question à un rôle dont le PATCH plus bas refuserait l'écriture
  // reviendrait à lui promettre une action qui échouerait au clic.
  const reportsFormation =
    can(session.roles, "courses") === "full"
      ? proposerReportsFormation((parsed.data.answers ?? {}) as Partial<Record<QuestionKey, string>>, {
          withdrawalAccessPolicy: dossier.session.course.withdrawalAccessPolicy,
        })
      : [];

  return NextResponse.json(
    { ...document, missingFields, reportsFormation, courseTitle: dossier.session.course.title, applied },
    { status: 201 },
  );
}

const reportSchema = z.object({
  dossierId: z.string().min(1),
  /** Les réponses SAISIES au questionnaire, telles qu'envoyées au POST. */
  answers: z.record(z.string()),
});

/**
 * Reporte sur la fiche formation ce que le questionnaire vient d'apprendre.
 *
 * Pourquoi ici plutôt que sur une route /api/formations : ce report n'a de
 * sens qu'en suite immédiate d'une génération, et il partage exactement son
 * entrée (un dossier, des réponses). L'y coller garde la règle « ce qu'une
 * réponse renseigne » dans un seul fichier de bout en bout.
 *
 * Rien de ce que le navigateur envoie n'est écrit tel quel : il fournit le
 * dossier et les réponses, le serveur relit la formation en base et
 * RECALCULE ce qui est reportable avec la même fonction pure que l'écran.
 * Un champ et une valeur envoyés par le client écriraient n'importe quoi sur
 * une formation partagée par tous ses dossiers.
 */
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Modifier une formation, pas générer un document : c'est la permission
  // « courses » à son niveau plein qui décide, comme partout ailleurs.
  if (can(session.roles, "courses") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: parsed.data.dossierId, organizationId: session.organizationId },
    select: {
      session: {
        select: { course: { select: { id: true, title: true, withdrawalAccessPolicy: true } } },
      },
    },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const course = dossier.session.course;
  const reports = proposerReportsFormation(parsed.data.answers as Partial<Record<QuestionKey, string>>, {
    withdrawalAccessPolicy: course.withdrawalAccessPolicy,
  });
  if (reports.length === 0) {
    // Rien à faire : la formation a été renseignée entre-temps, ou la réponse
    // ne correspond à aucun champ. Ce n'est pas une erreur — l'écran a juste
    // proposé un report devenu sans objet.
    return NextResponse.json({ updated: [], courseTitle: course.title });
  }

  // Écriture champ par champ et non par une boucle sur une clé dynamique :
  // Prisma doit voir des colonnes nommées, et un `data[champ] = valeur`
  // laisserait passer demain un champ ajouté au catalogue sans qu'on ait
  // vérifié qu'il est bien écrivable depuis un document.
  const data: { withdrawalAccessPolicy?: string } = {};
  for (const report of reports) {
    if (report.champ === "withdrawalAccessPolicy") data.withdrawalAccessPolicy = report.valeur;
  }

  // course.id vient de la base, via un dossier déjà filtré par
  // organizationId — jamais d'un identifiant fourni par l'appelant.
  await prisma.course.update({ where: { id: course.id }, data });

  return NextResponse.json({ updated: reports.map((r) => r.libelle), courseTitle: course.title });
}
