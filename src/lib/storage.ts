import { put, del } from "@vercel/blob";

// Real file storage for LMS module content (video/document) — platform-
// level, like AI/Brevo (Conforma hosts the files, not each OFP's own
// infrastructure), via Vercel Blob: one BLOB_READ_WRITE_TOKEN env var,
// works identically in local dev and on Vercel (unlike writing to local
// disk, which would silently break in production — serverless functions
// don't have a persistent filesystem). Every other `fileUrl` in this app
// (Document.fileUrl, dossier attachments) is still just a pasted external
// link; this is the first real upload path.
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB — generous for video

const NOT_CONFIGURED_ERROR =
  "Stockage de fichiers momentanément indisponible — BLOB_READ_WRITE_TOKEN n'est pas configuré côté serveur (voir README).";

export async function uploadModuleFile(params: {
  organizationId: string;
  moduleId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error(NOT_CONFIGURED_ERROR);
  if (params.file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Fichier trop volumineux (limite 500 Mo).");
  }

  // Path is namespaced by org + module — never guessable across tenants,
  // and addRandomSuffix avoids collisions on repeat uploads of the same
  // filename without needing to check-then-write.
  const pathname = `lms/${params.organizationId}/${params.moduleId}/${params.file.name}`;
  const blob = await put(pathname, params.file, {
    access: "public",
    addRandomSuffix: true,
    contentType: params.file.type || undefined,
  });

  return { url: blob.url, fileName: params.file.name, sizeBytes: params.file.size };
}

export async function deleteModuleFile(url: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await del(url).catch(() => {
    // Non-fatal — the DB row is still the source of truth; an orphaned
    // blob costs storage, not correctness.
  });
}
