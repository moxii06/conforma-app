import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { indemniteApplicable, lireIndemniteParam } from "@/lib/cancellationFee";
import { getSessionContext, can } from "@/lib/tenant";
import { mergeTemplate, mergeTemplatePartial, findEmptyMergeFields, describeMissingFields } from "@/lib/mergeTemplate";
import { resolveAnswers, resolveSubrogatedFunderName, QUESTION_BY_KEY, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { computeFundingSummary, resolveDossierPriceCents } from "@/lib/funding";
import { scopeOfCategory, unresolvedTags } from "@/lib/documentScope";
import { Role } from "@prisma/client";

// La prévisualisation de l'écran de création. Un seul chemin, quel que
// soit le contexte : sans formation, avec une formation, ou centré sur un
// apprenant précis.
//
// Il existait déjà quatre routes de prévisualisation (dossier, prospect,
// session, sous-traitant), écrites au fil des dialogues d'envoi. Celle de
// session ne savait même pas assembler les blocs conditionnels : elle
// fusionnait le modèle brut contre un contact vide. En ajouter une
// cinquième pour le nouvel écran aurait figé cet éparpillement ; le lot 3,
// qui unifie l'envoi, ramènera les autres ici.
//
// Rien n'est persisté. C'est /api/documents/draft qui enregistre.

export async function GET(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "dossiers") === "none" && can(auth.role, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId");
  const sessionId = url.searchParams.get("sessionId");
  if (!templateId) return NextResponse.json({ error: "templateId requis." }, { status: 400 });

  let manualAnswers: Partial<Record<QuestionKey, string>> | undefined;
  // L’indemnité de résiliation stipulée POUR CE CONTRAT — voir
  // lib/cancellationFee.ts. Absente, la proposition de l’organisme joue.
  const indemnite = lireIndemniteParam(url.searchParams.get("indemnite"));
  // Résolue une fois pour le questionnaire et pour la fusion — les deux
  // doivent parler du même pourcentage.
  const answersRaw = url.searchParams.get("answers");
  if (answersRaw) {
    try {
      manualAnswers = JSON.parse(answersRaw);
    } catch {
      return NextResponse.json({ error: "Paramètre answers invalide." }, { status: 400 });
    }
  }

  const [template, organization] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] },
      include: { blocks: { orderBy: { order: "asc" } } },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: auth.organizationId },
      include: { referentHandicapUser: { select: { name: true } } },
    }),
  ]);
  if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

  const scope = scopeOfCategory(template.category);

  // La session donne le contexte : la formation, ses dates, son prix, et
  // le premier inscrit qui sert d'exemple. Sur un document par apprenant,
  // c'est bien un exemple — la génération refera le travail pour chacun.
  const session = sessionId
    ? await prisma.session.findFirst({
        where: { id: sessionId, organizationId: auth.organizationId },
        include: {
          course: true,
          dossiers: {
            include: {
              contact: { include: { company: true } },
              fundingCommitments: { include: { funder: { select: { name: true } } } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : null;
  if (sessionId && !session) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (session && auth.role === Role.TRAINER && session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const exemple = session?.dossiers[0] ?? null;
  // L'indemnité stipulée pour CE contrat, ou la proposition de l'organisme
  // quand l'écran n'a pas d'avis — voir lib/cancellationFee.ts.
  const indemniteEffective = indemniteApplicable(indemnite, organization.cancellationFeePercent);

  let bodyTextSource = template.bodyText;
  let applied: { key: string; value: string }[] = [];
  if (template.blocks.length > 0) {
    const referenced = collectQuestionKeys(template.blocks);

    // Sans formation choisie, rien n'est déductible : la modalité, le
    // statut de l'apprenant, le reste à charge n'existent pas encore.
    // ResolveContext exige pourtant un format de session — lui en inventer
    // un ferait passer une supposition pour une donnée, sur un document
    // contractuel. On pose donc toutes les questions, ce qui est la
    // réponse honnête à « je ne sais pas ».
    const { answers, unresolved } = session
      ? resolveAnswers(
          {
            dossier: {
              learnerCategory: exemple?.learnerCategory ?? null,
              agreedPriceCents: exemple?.agreedPriceCents ?? null,
            },
            session: { format: session.format },
            course: { priceCents: session.course.priceCents, certificationCode: session.course.certificationCode },
            fundingCommitments: exemple?.fundingCommitments ?? [],
            organization: {
              withdrawalAccessPolicy: organization.withdrawalAccessPolicy,
              cancellationFeePercent: indemniteEffective,
            },
          },
          manualAnswers,
        )
      : {
          answers: (manualAnswers ?? {}) as Partial<Record<QuestionKey, string>>,
          unresolved: referenced.filter((k) => !manualAnswers?.[k]),
        };

    const stillMissing = referenced.filter((k) => unresolved.includes(k));
    if (stillMissing.length > 0) {
      // L'écran affiche alors le petit questionnaire, et rappelle cette
      // route avec les réponses. Il ne montre PAS un document tronqué :
      // un contrat auquel il manque un article se lit comme un contrat.
      return NextResponse.json({
        needsAnswers: stillMissing.map((k) => QUESTION_BY_KEY[k]),
        category: template.category,
        scope,
      });
    }
    bodyTextSource = assembleBlocks(template.blocks, answers);
    applied = referenced.flatMap((k) => (answers[k] != null ? [{ key: k, value: answers[k] }] : []));
  }

  const fundingSummary = exemple
    ? computeFundingSummary(resolveDossierPriceCents(exemple, session!.course), exemple.fundingCommitments)
    : { totalCents: 0, remainderCents: 0 };

  const mergeContext = {
    // Sur un document par apprenant, on NE fusionne PAS l'exemple : les
    // balises du stagiaire doivent rester visibles dans le brouillon, sinon
    // l'organisme croirait éditer le contrat de tout le monde alors qu'il
    // regarde celui du premier inscrit.
    contact:
      scope === "per_learner" || !exemple
        ? { firstName: "", lastName: "", email: "", phone: null }
        : exemple.contact,
    organization: { ...organization, cancellationFeePercent: indemniteEffective, referentHandicapName: organization.referentHandicapUser?.name ?? null },
    session: session
      ? { courseTitle: session.course.title, startsAt: session.startsAt, location: session.location }
      : undefined,
    course: session?.course,
    company: exemple?.contact.company
      ? {
          name: exemple.contact.company.name,
          siret: exemple.contact.company.siret,
          address: exemple.contact.company.address,
          legalRepresentativeName: exemple.contact.company.legalRepresentativeName,
        }
      : null,
    funder: (() => {
      const name = exemple ? resolveSubrogatedFunderName(exemple.fundingCommitments) : null;
      return name ? { name } : null;
    })(),
    funding: { totalCents: fundingSummary.totalCents, remainderCents: fundingSummary.remainderCents },
  };
  // Sur un document par apprenant, mergeTemplatePartial LAISSE le jeton en
  // place quand la valeur est vide, au lieu de le remplacer par du blanc.
  // Sans lui, la prévisualisation d'un contrat affichait « Entre  ,
  // demeurant   » — un contrat sans partie identifiée, ce qui se lit comme
  // un document cassé plutôt que comme un modèle à personnaliser.
  const bodyText =
    scope === "per_learner" ? mergeTemplatePartial(bodyTextSource, mergeContext) : mergeTemplate(bodyTextSource, mergeContext);

  return NextResponse.json({
    title: session ? `${template.title} — ${session.course.title}` : template.title,
    bodyText,
    category: template.category,
    scope,
    learnerCount: session?.dossiers.length ?? 0,
    applied,
    needsAnswers: [],
    missingFields: describeMissingFields(findEmptyMergeFields(bodyTextSource, mergeContext)),
    // Les balises qu'un destinataire lirait en toutes lettres. Sur un
    // document par apprenant, celles du stagiaire sont exclues : elles se
    // résolvent à la génération.
    remainingTags: unresolvedTags(bodyText, scope),
  });
}
