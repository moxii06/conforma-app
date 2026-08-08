import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { isYousignConfigured, sendDocumentForSignature } from "@/lib/yousign";
import { recordActivationEvent } from "@/lib/activation";
import { borneAuxSiennesDuFormateur } from "@/lib/proprieteRoles";

// A payment schedule rides along when the document is a contract or a
// convention (see PaymentScheduleBuilder). Stored on the Document row, NOT
// materialised as invoices here: the instalments become money owed only when
// the contract is signed (syncParcoursFromSignedDocument), so an unsigned
// contract never leaves phantom invoices in Facturation.
const scheduleSchema = z
  .array(
    z.object({
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountCents: z.number().int().positive(),
      label: z.string().max(80).optional(),
    }),
  )
  .max(24);

// Client feedback: sending a document should produce a real email — the
// chosen file (a generated PDF from a library template, or something
// picked from the OF's own computer) goes out as a real attachment, next
// to a rich-text message the sender composes themselves (with their own
// signature), not a bare "here's a link" notice. Reused by both the
// Documents tab and the Info tab's Communications panel (SendDocumentDialog).
// Unlike the fixed contract/convocation/platform_access flows in
// outreach/route.ts, this doesn't create a ClientOutreach row — that
// model's ack-tracking (signed/activated) is specific to those three, not
// a generic "here's a file" send.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dossier = await prisma.dossier.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { contact: true, session: { include: { course: true } } },
  });
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  // Borne calculée sur les rôles effectifs — voir lib/proprieteRoles.ts.
  if (borneAuxSiennesDuFormateur(auth.roles) && dossier.session.trainerId !== auth.userId) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
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

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

  let templateOrigin: string | undefined;
  let resolvedCategory = category;
  let bodyHtml: string | undefined;
  if (mode === "template") {
    bodyHtml = sanitizeRichText(formData.get("bodyText")?.toString() ?? "");
    if (!richTextToPlainText(bodyHtml)) return NextResponse.json({ error: "Le contenu du document est vide." }, { status: 400 });
    const templateId = formData.get("templateId")?.toString() || null;
    const template = templateId
      ? await prisma.documentTemplate.findFirst({ where: { id: templateId, OR: [{ organizationId: auth.organizationId }, { organizationId: null }] } })
      : null;
    templateOrigin = template?.title;
    resolvedCategory = template?.category ?? category;
  }

  // Parsed but never judged: the ceiling warning lives client-side and the
  // organisation may knowingly exceed it. What the server refuses is only a
  // malformed schedule — negative amounts, absurd sizes — because that is
  // corruption, not a business choice.
  let paymentSchedule: Prisma.InputJsonValue | undefined;
  const rawSchedule = formData.get("paymentSchedule")?.toString();
  if (rawSchedule) {
    let json: unknown;
    try {
      json = JSON.parse(rawSchedule);
    } catch {
      return NextResponse.json({ error: "Échéancier invalide." }, { status: 400 });
    }
    const parsed = scheduleSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Échéancier invalide." }, { status: 400 });
    if (parsed.data.length > 0) paymentSchedule = parsed.data;
  }

  let attachment;
  try {
    attachment = await buildDocumentAttachment({
      mode,
      title,
      bodyHtml,
      file: mode === "upload" ? (formData.get("file") as File | null) ?? undefined : undefined,
      organizationId: auth.organizationId,
      ownerKey: dossier.id,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de la préparation du document." }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      organizationId: auth.organizationId,
      dossierId: dossier.id,
      title,
      fileUrl: attachment.fileUrl,
      templateOrigin,
      category: resolvedCategory,
      sentByUserId: auth.userId,
      sentByName: auth.name || auth.email,
      signatureStatus: requiresSignature ? "pending" : "none",
      // Overwritten below if the Yousign send succeeds — until then a
      // requested signature is the free internal stub.
      signatureProvider: requiresSignature ? "stub" : null,
      ...(paymentSchedule !== undefined ? { paymentSchedule } : {}),
    },
  });
  await recordActivationEvent(auth.organizationId, "first_document_sent");

  // Real Yousign flow when the org has a key configured — falls back to the
  // internal stub (learner clicks "signer" in mon-espace) otherwise, same
  // as every other "prepared but unreachable until configured" integration
  // in this app. A Yousign failure here is non-fatal: the document still
  // exists and behaves like the stub flow rather than blocking the send.
  let sentViaYousign = false;
  if (requiresSignature && (await isYousignConfigured(auth.organizationId))) {
    try {
      const { signatureRequestId, provider } = await sendDocumentForSignature(auth.organizationId, {
        name: title,
        pdf: Buffer.from(attachment.contentBase64, "base64"),
        filename: attachment.fileName,
        signerFirstName: dossier.contact.firstName,
        signerLastName: dossier.contact.lastName,
        signerEmail: dossier.contact.email,
      });
      await prisma.document.update({
        where: { id: document.id },
        data: { yousignSignatureRequestId: signatureRequestId, signatureProvider: provider },
      });
      sentViaYousign = true;
    } catch {
      // Falls through to the stub flow below — signatureStatus stays "pending".
    }
  }

  const signatureNote = sentViaYousign
    ? `<p><br></p><p>Ce document attend votre signature électronique — vous allez recevoir un email séparé de Yousign avec le lien pour signer.</p>`
    : requiresSignature
      ? `<p><br></p><p>Ce document attend votre signature électronique — rendez-vous dans votre espace personnel, onglet « Mes documents », pour le signer.</p>`
      : "";
  const mergeCtx = {
    firstName: dossier.contact.firstName,
    lastName: dossier.contact.lastName,
    courseTitle: dossier.session.course.title,
    sessionDateLabel:
      dossier.session.mode === "ROLLING"
        ? "formation en continu"
        : dossier.session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    organizationName: organization.name,
  };
  const messageHtml = fillMergeTags(
    (sanitizeRichText(messageHtmlRaw) || `<p>Bonjour ${dossier.contact.firstName},</p><p>Veuillez trouver ci-joint : ${title}.</p>`) +
      signatureNote,
    mergeCtx
  );

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: dossier.contact.email,
      toName: `${dossier.contact.firstName} ${dossier.contact.lastName}`,
      subject: `${organization.name} — ${title}`,
      text: richTextToPlainText(messageHtml),
      html: messageHtml,
      senderName: organization.name,
      replyTo: auth.email,
      attachment: { name: attachment.fileName, contentBase64: attachment.contentBase64 },
    });
    emailSent = true;
  } catch {
    // Non-fatal — the document record still exists and can be shared manually.
  }

  return NextResponse.json({ document, emailSent, documentUrl: attachment.fileUrl }, { status: 201 });
}
