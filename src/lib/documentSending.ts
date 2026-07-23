import { put } from "@vercel/blob";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";

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
