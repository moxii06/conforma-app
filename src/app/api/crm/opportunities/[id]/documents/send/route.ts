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
  if (mode !== "template" && mode !== "upload") return NextResponse.json({ error: "Mode invalide." }, { status: 400 });

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

  let attachment;
  try {
    attachment = await buildDocumentAttachment({
      mode,
      title,
      bodyHtml,
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

  return NextResponse.json({ document, emailSent, documentUrl: attachment.fileUrl }, { status: 201 });
}
