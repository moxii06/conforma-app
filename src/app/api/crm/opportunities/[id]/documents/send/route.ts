import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canManageOpportunity } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { isYousignConfigured, sendDocumentForSignature } from "@/lib/yousign";
import { recordActivationEvent } from "@/lib/activation";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { resolveAnswers, type QuestionKey } from "@/lib/documentQuestionnaire";
import { assembleBlocks, collectQuestionKeys } from "@/lib/documentAssembly";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { buildFacturationPdf } from "@/lib/invoiceDocument";
import { marquerDevisEnvoye } from "@/lib/quoteStatus";
import { appliquerStatutFacture } from "@/lib/invoiceStatus";
import { DocStatus } from "@prisma/client";

// Opportunity-level counterpart to /api/dossiers/[id]/documents/send — see
// that route's comment for the real-attachment + rich-message rationale.
// E-signature here is Yousign-or-nothing: a prospect has no platform login
// yet, so the dossier flow's internal stub fallback (learner clicks
// "signer" in mon-espace) can't exist at this stage — if Yousign fails or
// isn't configured, the document simply goes out unsigned.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { contact: { include: { company: true } }, courseOfInterest: true },
  });
  if (!opportunity) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  if (!canManageOpportunity(session.role, session.userId, opportunity)) {
    return NextResponse.json({ error: "Cette opportunité appartient à un autre commercial." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const mode = formData.get("mode")?.toString();
  const title = formData.get("title")?.toString().trim();
  const category = formData.get("category")?.toString() || "other";
  const messageHtmlRaw = formData.get("message")?.toString() ?? "";
  const requiresSignature = formData.get("requiresSignature") === "true";
  if (!title) return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  if (mode !== "template" && mode !== "upload" && mode !== "quote" && mode !== "invoice") {
    return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  }
  const estPieceFinanciere = mode === "quote" || mode === "invoice";

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  let templateOrigin: string | undefined;
  let resolvedCategory = category;
  let bodyHtml: string | undefined;
  if (mode === "template") {
    // Audit P1 : le document est assemblé et fusionné CÔTÉ SERVEUR depuis le
    // modèle (+ réponses au questionnaire pour un modèle conditionnel) — le
    // dialogue n'a plus d'éditeur de contenu, donc plus de bodyText client.
    const templateId = formData.get("templateId")?.toString() || null;
    if (!templateId) return NextResponse.json({ error: "Modèle requis." }, { status: 400 });
    const template = await prisma.documentTemplate.findFirst({
      where: { id: templateId, OR: [{ organizationId: session.organizationId }, { organizationId: null }] },
      include: { course: true, blocks: { orderBy: { order: "asc" } } },
    });
    if (!template) return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });

    let manualAnswers: Partial<Record<QuestionKey, string>> = {};
    const answersRaw = formData.get("answers")?.toString();
    if (answersRaw) {
      try {
        manualAnswers = JSON.parse(answersRaw);
      } catch {
        return NextResponse.json({ error: "Paramètre answers invalide." }, { status: 400 });
      }
    }

    const course = template.course ?? opportunity.courseOfInterest;
    let bodyTextSource = template.bodyText;
    if (template.blocks.length > 0) {
      const { answers, unresolved } = resolveAnswers(
        {
          dossier: { learnerCategory: opportunity.contact.defaultLearnerCategory, agreedPriceCents: opportunity.amountCents },
          session: { format: null },
          course: { priceCents: course?.priceCents ?? null, certificationCode: course?.certificationCode ?? null },
          fundingCommitments: [],
          organization: { withdrawalAccessPolicy: organization.withdrawalAccessPolicy, cancellationFeePercent: organization.cancellationFeePercent },
        },
        manualAnswers,
      );
      const stillMissing = collectQuestionKeys(template.blocks).filter((k) => unresolved.includes(k));
      if (stillMissing.length > 0) {
        return NextResponse.json({ error: "Répondez d'abord aux questions du modèle." }, { status: 400 });
      }
      bodyTextSource = assembleBlocks(template.blocks, answers);
    }

    const bodyText = mergeTemplate(bodyTextSource, {
      contact: opportunity.contact,
      organization,
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
    });
    bodyHtml = sanitizeRichText(plainTextToHtml(bodyText));
    if (!richTextToPlainText(bodyHtml)) return NextResponse.json({ error: "Le contenu du document est vide." }, { status: 400 });
    templateOrigin = template.title;
    resolvedCategory = template.category ?? category;
  }

  // Devis ou facture : un PDF déjà rendu par la Facturation, joint tel quel.
  // On le charge avant l'envoi pour qu'une pièce introuvable échoue ici, avec
  // un message clair, plutôt qu'après avoir écrit un Document sans contenu.
  let devis: { id: string; contactId: string } | null = null;
  let factureId: string | null = null;
  let octets: { buffer: Buffer; fileName: string; mimeType: string } | undefined;
  if (estPieceFinanciere) {
    const pieceId = formData.get("pieceId")?.toString() || null;
    const nom = mode === "quote" ? "Devis" : "Facture";
    if (!pieceId) return NextResponse.json({ error: `${nom} requis.` }, { status: 400 });

    // Le filtre sur contactId n'est pas décoratif : sans lui, l'identifiant
    // d'une pièce appartenant à un autre prospect du même organisme partirait
    // chez celui-ci.
    const portee = { id: pieceId, organizationId: session.organizationId, contactId: opportunity.contactId };
    const piece =
      mode === "quote"
        ? await prisma.quote.findFirst({ where: portee, select: { id: true, contactId: true } })
        : await prisma.invoice.findFirst({ where: portee, select: { id: true, contactId: true } });
    if (!piece) return NextResponse.json({ error: `${nom} introuvable pour ce prospect.` }, { status: 404 });

    const built = await buildFacturationPdf(mode, piece.id, session.organizationId);
    if (!built) return NextResponse.json({ error: `${nom} introuvable.` }, { status: 404 });
    if (mode === "quote") devis = piece;
    else factureId = piece.id;
    octets = { buffer: built.pdf, fileName: built.fileName, mimeType: "application/pdf" };
    resolvedCategory = mode;
  }

  let attachment;
  try {
    attachment = await buildDocumentAttachment({
      // « quote » côté écran, « bytes » côté pièce jointe : le premier dit
      // d'où vient le document, le second comment il se fabrique. Les
      // confondre obligerait buildDocumentAttachment à connaître la
      // facturation.
      mode: estPieceFinanciere ? "bytes" : mode,
      title,
      bodyHtml,
      bytes: octets,
      file: mode === "upload" ? (formData.get("file") as File | null) ?? undefined : undefined,
      organizationId: session.organizationId,
      ownerKey: `opportunity-${opportunity.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de la préparation du document." }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      organizationId: session.organizationId,
      title,
      fileUrl: attachment.fileUrl,
      templateOrigin,
      category: resolvedCategory,
      sentByUserId: session.userId,
      sentByName: session.name || session.email,
      // Sans ces deux liens, le document n'appartenait à personne : aucune
      // notification à la signature, aucun échéancier matérialisé, invisible
      // dans la bibliothèque comme sur la fiche contact.
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
    },
  });
  await recordActivationEvent(session.organizationId, "first_document_sent");

  let sentViaYousign = false;
  if (requiresSignature && (await isYousignConfigured(session.organizationId))) {
    try {
      const { signatureRequestId, provider } = await sendDocumentForSignature(session.organizationId, {
        name: title,
        pdf: Buffer.from(attachment.contentBase64, "base64"),
        filename: attachment.fileName,
        signerFirstName: opportunity.contact.firstName,
        signerLastName: opportunity.contact.lastName,
        signerEmail: opportunity.contact.email,
      });
      await prisma.document.update({
        where: { id: document.id },
        data: { signatureStatus: "pending", yousignSignatureRequestId: signatureRequestId, signatureProvider: provider },
      });
      sentViaYousign = true;
    } catch {
      // Non-fatal — no stub fallback exists pre-enrollment, the document
      // simply goes out unsigned and the record keeps signatureStatus "none".
    }
  }

  const signatureNote = sentViaYousign
    ? `<p><br></p><p>Ce document attend votre signature électronique — vous allez recevoir un email séparé de Yousign avec le lien pour signer.</p>`
    : "";
  const messageHtml = fillMergeTags(
    (sanitizeRichText(messageHtmlRaw) || `<p>Bonjour ${opportunity.contact.firstName},</p><p>Veuillez trouver ci-joint : ${title}.</p>`) +
      signatureNote,
    { firstName: opportunity.contact.firstName, lastName: opportunity.contact.lastName, organizationName: organization.name }
  );

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: opportunity.contact.email,
      toName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
      subject: `${organization.name} — ${title}`,
      text: richTextToPlainText(messageHtml),
      html: messageHtml,
      senderName: organization.name,
      replyTo: session.email,
      attachment: { name: attachment.fileName, contentBase64: attachment.contentBase64 },
    });
    emailSent = true;
  } catch {
    // Non-fatal — the document record still exists and can be shared manually.
  }

  // Envoyer un devis est un jalon commercial, pas une pièce jointe de plus :
  // le devis passe à « envoyé » et l'affaire avance à « Devis envoyé ». La
  // règle vient de lib/quoteStatus.ts, la même que la Facturation appelle —
  // sinon les deux écrans finiraient par ne plus dire la même chose.
  //
  // Après l'envoi et non avant : marquer envoyé un devis dont le mail a
  // échoué mentirait sur l'état de la relation commerciale. Le jalon suit
  // donc le sort de l'e-mail.
  if (devis && emailSent) {
    await marquerDevisEnvoye(session.organizationId, devis);
  }

  // La facture, elle, ne déplace RIEN dans le CRM — et l'asymétrie est voulue.
  // Émettre n'est pas encaisser : seul le règlement complet clôt l'affaire
  // (voir lib/invoiceStatus.ts, qui n'avance l'étape que sur « payée »). Faire
  // avancer le pipeline ici afficherait des affaires terminées qui n'ont pas
  // encore vu un euro. On passe par appliquerStatutFacture malgré tout, pour
  // que « ce que change un changement de statut » reste à un seul endroit.
  if (factureId && emailSent) {
    await appliquerStatutFacture(session.organizationId, factureId, DocStatus.SENT);
  }

  return NextResponse.json({ document, emailSent, documentUrl: attachment.fileUrl }, { status: 201 });
}
