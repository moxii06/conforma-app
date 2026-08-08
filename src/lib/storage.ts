import { put, del } from "@vercel/blob";

// Real file storage for uploads (LMS module content, dossier documents,
// subcontractor and team-member records) — platform-level, like AI/Brevo:
// Jalon hosts the files, not each OFP's own infrastructure.
//
// `access: "private"`. These are signed conventions, CVs, diplomas and
// subcontractor contracts: personal data. A public blob URL is unguessable
// but permanent and unauthenticated, so once it leaks (a forwarded email, a
// proxy log, browser history) it grants access forever, and deleting the row
// does not revoke it — a GDPR erasure request could not actually be honoured.
// Private blobs are readable only server-side with the store token, which is
// why every consumer goes through an authenticated route (see blobStream.ts).
//
// Two stores exist during the transition, hence the explicit `token`:
//   - `conforma-prive` (cdg1/Paris, private) — everything uploaded from now
//     on. Its token is BLOB_PRIVATE_READ_WRITE_TOKEN.
//   - `conforma-lms` (iad1, public) — the ~25 files uploaded before the
//     switch. Still reachable via BLOB_READ_WRITE_TOKEN, which the SDK picks
//     up by default; blobStream.ts falls back to it on read.
// Access mode is fixed per store on Vercel ("Cannot use private access on a
// public store"), which is why this is a second store and not a flag flip.
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB — generous for video

const NOT_CONFIGURED_ERROR =
  "Stockage de fichiers momentanément indisponible — BLOB_PRIVATE_READ_WRITE_TOKEN n'est pas configuré côté serveur (voir README).";

export function privateStoreToken(): string | undefined {
  return process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
}

// The four upload helpers below differ only in how they namespace the
// pathname; sharing the body keeps their access mode and size limit from
// drifting apart, which is exactly the kind of gap a per-function copy grows.
async function uploadPrivate(pathname: string, file: File) {
  const token = privateStoreToken();
  if (!token) throw new Error(NOT_CONFIGURED_ERROR);
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Fichier trop volumineux (limite 500 Mo).");
  }

  // addRandomSuffix avoids collisions on repeat uploads of the same filename
  // without needing to check-then-write. It is not a security measure — the
  // store's access mode is.
  const blob = await put(pathname, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || undefined,
    token,
  });

  return { url: blob.url, fileName: file.name, sizeBytes: file.size };
}

export async function uploadModuleFile(params: {
  organizationId: string;
  moduleId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(`lms/${params.organizationId}/${params.moduleId}/${params.file.name}`, params.file);
}

// The "envoyer un document" dialog's local-file path (dossier records, not
// LMS module content) — separate pathname namespace, same mechanics.
export async function uploadDossierDocument(params: {
  organizationId: string;
  dossierId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(`dossiers/${params.organizationId}/${params.dossierId}/${params.file.name}`, params.file);
}

// A subcontractor's tracked documents (contrat/CV/diplôme/NDA).
export async function uploadSubcontractorDocument(params: {
  organizationId: string;
  subcontractorId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(
    `subcontractors/${params.organizationId}/${params.subcontractorId}/${params.file.name}`,
    params.file,
  );
}

// A team member's own documents (CV, diplôme...).
export async function uploadUserDocument(params: {
  organizationId: string;
  userId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(`team-members/${params.organizationId}/${params.userId}/${params.file.name}`, params.file);
}

// La preuve de traitement d'une réclamation ou d'un signalement confidentiel
// (Complaint/SecureReport.proofFileUrl). Même magasin privé que le reste, et
// pour la même raison en plus forte : un compte rendu de traitement de
// signalement nomme des personnes et raconte des faits qui les concernent.
// `kind` sépare les deux familles dans le chemin, comme dossiers/ et
// subcontractors/ le font déjà pour les leurs.
export async function uploadSupportProof(params: {
  organizationId: string;
  kind: string;
  itemId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(`support/${params.organizationId}/${params.kind}/${params.itemId}/${params.file.name}`, params.file);
}

// An attachment pulled off a synced inbound email (see mailboxMatching.ts's
// persistEmailAttachments) — namespaced by message rather than by contact
// since at sync time the message is often still unmatched (contactId null).
export async function uploadEmailAttachment(params: {
  organizationId: string;
  messageId: string;
  file: File;
}): Promise<{ url: string; fileName: string; sizeBytes: number }> {
  return uploadPrivate(`emails/${params.organizationId}/${params.messageId}/${params.file.name}`, params.file);
}

// Deletion has to cover both stores: a blob uploaded today lives in the
// private one, an older one in the public one, and the caller has no reason
// to know which.
//
// Both are asked unconditionally, rather than trying one and falling back on
// failure, because failure never comes: "A delete action won't throw if the
// blob url doesn't exist" (Vercel docs). A blob that lives in the other store
// looks exactly like a blob that doesn't exist, so try/catch cannot tell them
// apart — the first call would report success, having deleted nothing, and
// the legacy store would never be reached. That matters more than an orphaned
// blob usually would: the legacy store is public, so a file left behind there
// stays reachable by URL after the user deleted the record, which is exactly
// what a GDPR erasure request must not do.
//
// Sending a delete to the wrong store is harmless for the same reason — a
// no-op — and pathnames carry a random suffix, so one store's pathname never
// names a real blob in the other.
export async function deleteModuleFile(url: string): Promise<void> {
  const stores: Promise<unknown>[] = [];
  const token = privateStoreToken();
  if (token) stores.push(del(url, { token }));
  if (process.env.BLOB_READ_WRITE_TOKEN) stores.push(del(url));
  // Non-fatal: the DB row is the source of truth, and a caller mid-delete
  // shouldn't fail because storage hiccuped.
  await Promise.all(stores.map((p) => p.catch(() => {})));
}
