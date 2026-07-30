import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { buildDocumentAttachment } from "@/lib/documentSending";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { isYousignConfigured, sendDocumentForSignature } from "@/lib/yousign";

// Subcontractor-level counterpart to /api/dossiers/[id]/documents/send and
// /api/crm/opportunities/[id]/documents/send — same real-attachment +
// rich-message mechanics, but the Document this creates carries
// subcontractorId (not dossierId), so it lands in the subcontractor's own
// "Documents liés" card exactly like a manual upload does (see
// AddSubcontractorDocumentForm) rather than becoming an orphan row visible
// only on the send screen itself, which is what the opportunity route does.
//
// E-signature is Yousign-or-nothing, same reasoning as the prospect route:
// a subcontractor's linked account (if any) is role TRAINER, and the
// internal stub signer (/api/documents/[id]/sign) is hard-gated to LEARNER
// + a dossier — there is no internal fallback to offer here either.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "team") !== "full") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const subcontractor = await prisma.subcontractor.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
  });
  if (!subcontractor) return NextResponse.json({ error: "Sous-traitant introuvable." }, { status: 404 });
  if (!subcontractor.contactEmail) {
    return NextResponse.json({ error: "Aucun email de contact renseigné pour ce sous-traitant." }, { status: 400 });
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

  let attachment;
  try {
    attachment = await buildDocumentAttachment({
      mode,
      title,
      bodyHtml,
      file: mode === "upload" ? (formData.get("file") as File | null) ?? undefined : undefined,
      organizationId: auth.organizationId,
      ownerKey: `subcontractor-${subcontractor.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de la préparation du document." }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      organizationId: auth.organizationId,
      subcontractorId: subcontractor.id,
      title,
      fileUrl: attachment.fileUrl,
      templateOrigin,
      category: resolvedCategory,
      sentByUserId: auth.userId,
      sentByName: auth.name || auth.email,
      signatureStatus: requiresSignature ? "pending" : "none",
      signatureProvider: requiresSignature ? "stub" : null,
    },
  });

  // Best-effort split — Subcontractor has one free-text `name`, Yousign
  // wants firstName/lastName. A company name (no space) lands entirely in
  // signerFirstName, which Yousign accepts fine as a display string.
  const [signerFirstName, ...rest] = subcontractor.name.trim().split(/\s+/);
  const signerLastName = rest.join(" ") || signerFirstName;

  let sentViaYousign = false;
  if (requiresSignature && (await isYousignConfigured(auth.organizationId))) {
    try {
      const { signatureRequestId, provider } = await sendDocumentForSignature(auth.organizationId, {
        name: title,
        pdf: Buffer.from(attachment.contentBase64, "base64"),
        filename: attachment.fileName,
        signerFirstName,
        signerLastName,
        signerEmail: subcontractor.contactEmail,
      });
      await prisma.document.update({
        where: { id: document.id },
        data: { yousignSignatureRequestId: signatureRequestId, signatureProvider: provider },
      });
      sentViaYousign = true;
    } catch {
      // Falls through — the document still goes out, just unsigned.
    }
  }

  const signatureNote = sentViaYousign
    ? `<p><br></p><p>Ce document attend votre signature électronique — vous allez recevoir un email séparé de Yousign avec le lien pour signer.</p>`
    : "";
  const messageHtml = fillMergeTags(
    (sanitizeRichText(messageHtmlRaw) || `<p>Bonjour,</p><p>Veuillez trouver ci-joint : ${title}.</p>`) + signatureNote,
    { firstName: subcontractor.name, lastName: "", organizationName: organization.name },
  );

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: subcontractor.contactEmail,
      toName: subcontractor.name,
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
