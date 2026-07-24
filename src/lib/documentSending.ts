import { put } from "@vercel/blob";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";

const NOT_CONFIGURED_ERROR =
  "Stockage de fichiers momentanément indisponible — BLOB_READ_WRITE_TOKEN n'est pas configuré côté serveur (voir README).";

// Shared by the dossier and CRM-prospect "envoyer un document" send routes:
// turns either a rich-text template (→ a real generated PDF) or an
// uploaded file into (a) a persisted Blob so it shows up in the existing
// Documents list the same way an upload always has, and (b) base64 bytes
// ready to attach to the notification email — client feedback wants a real
// attachment, not a link to click.
export async function buildDocumentAttachment(params: {
  mode: "template" | "upload";
  title: string;
  bodyHtml?: string;
  file?: File;
  organizationId: string;
  ownerKey: string; // dossierId, or `opportunity-<id>` for a prospect with no dossier yet
}): Promise<{ fileUrl: string; fileName: string; sizeBytes: number; contentBase64: string; mimeType: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error(NOT_CONFIGURED_ERROR);

  let buffer: Buffer;
  let fileName: string;
  let mimeType: string;

  if (params.mode === "template") {
    buffer = await generatePdfFromRichText(params.title, params.bodyHtml ?? "");
    fileName = `${params.title.replace(/[^\w\- ]/g, "").slice(0, 80) || "document"}.pdf`;
    mimeType = "application/pdf";
  } else {
    if (!params.file) throw new Error("Fichier requis.");
    const arrayBuffer = await params.file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    fileName = params.file.name;
    mimeType = params.file.type || "application/octet-stream";
  }

  const pathname = `documents/${params.organizationId}/${params.ownerKey}/${fileName}`;
  const blob = await put(pathname, buffer, { access: "public", addRandomSuffix: true, contentType: mimeType });

  return {
    fileUrl: blob.url,
    fileName,
    sizeBytes: buffer.byteLength,
    contentBase64: buffer.toString("base64"),
    mimeType,
  };
}

// Shared by both signature-completion paths — the internal stub
// (src/app/api/documents/[id]/sign/route.ts, used when an org has no
// Yousign key on file) and the real Yousign webhook
// (src/app/api/webhooks/yousign/[organizationId]/route.ts) — so the
// notification a staff member gets doesn't drift between the two.
export async function notifyDocumentSigned(document: { id: string; title: string; sentByUserId: string | null; dossierId: string | null }, organizationId: string): Promise<void> {
  if (!document.sentByUserId || !document.dossierId) return;
  const [sender, organization, dossier] = await Promise.all([
    prisma.user.findUnique({ where: { id: document.sentByUserId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.dossier.findUnique({ where: { id: document.dossierId }, include: { contact: true } }),
  ]);
  if (!sender || !dossier) return;
  try {
    await sendTransactionalEmail({
      to: sender.email,
      toName: sender.name,
      subject: `Document signé — ${document.title}`,
      text: `${dossier.contact.firstName} ${dossier.contact.lastName} vient de signer « ${document.title} ».`,
      senderName: organization.name,
    });
  } catch {
    // Non-fatal — the signature itself is recorded either way.
  }
}
