import { put } from "@vercel/blob";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { privateStoreToken } from "@/lib/storage";
import { nextInvoiceReference } from "@/lib/invoiceReference";

const NOT_CONFIGURED_ERROR =
  "Stockage de fichiers momentanément indisponible — BLOB_PRIVATE_READ_WRITE_TOKEN n'est pas configuré côté serveur (voir README).";

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
  if (!privateStoreToken()) throw new Error(NOT_CONFIGURED_ERROR);

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

  // Private, like every other upload path — see the note in src/lib/storage.ts.
  // These are the signed conventions and contracts themselves. The recipient
  // still gets the actual bytes as an email attachment, so making the stored
  // copy private costs them nothing; it only closes the permanent
  // unauthenticated back door the public URL used to be.
  const pathname = `documents/${params.organizationId}/${params.ownerKey}/${fileName}`;
  const blob = await put(pathname, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: mimeType,
    token: privateStoreToken(),
  });

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

// Same audit-UX principle as the needs-assessment public route (see
// /api/public/needs-assessment/[token]): a Dossier's "Parcours de
// formation" checklist step should flip itself the moment the underlying
// event actually happens, not wait for staff to notice and toggle it by
// hand. "Convention signée" used to be the one step still requiring a
// manual click (the old /api/client-outreach/[id] PATCH route, from
// before Yousign was wired for real) — this closes that gap for the
// generic SendDocumentDialog path: any "convention"-category Document
// reaching signatureStatus "signed" (stub or real Yousign) marks the
// dossier's contract step done too. Silently a no-op for every other
// document category, so it's safe to call unconditionally from both
// signature-completion routes.
export async function syncParcoursFromSignedDocument(document: { category: string; dossierId: string | null }): Promise<void> {
  if (document.category !== "convention" || !document.dossierId) return;
  await prisma.dossier.update({ where: { id: document.dossierId }, data: { contractSigned: true } });
}

// The moment a contract carrying a payment schedule is signed, its
// instalments become money owed — and money owed, in this app, is an
// Invoice row. That single fact is what makes everything downstream work
// without new code: overdue detection (dashboardTasks), bank
// reconciliation, automatic PAID once covered (recordInvoicePayment).
//
// Deliberately AT SIGNATURE, not at send: the schedule sits inert on
// Document.paymentSchedule until then, so a contract that is never signed
// never leaves phantom instalments in Facturation. Called from the same two
// places as the helpers above — the internal stub and the Yousign webhook —
// so a schedule becomes invoices in exactly one way regardless of how the
// signature happened.
//
// Instalments are born DRAFT, dated from the schedule: the daily cron
// issues each one (DRAFT → SENT, with the notification email) shortly
// before it falls due, instead of the whole schedule landing in the
// learner's inbox on signature day.
export async function materialiseScheduleFromSignedDocument(document: {
  id: string;
  organizationId: string;
  dossierId: string | null;
  category: string;
  paymentSchedule: unknown;
}): Promise<number> {
  if (!document.dossierId) return 0;
  const schedule = parseStoredSchedule(document.paymentSchedule);
  if (schedule.length === 0) return 0;

  // Idempotency: one set of instalments per dossier, ever. Both signature
  // paths can fire for one document (stub then webhook), and a corrected
  // contract re-signed later must not double-bill the learner — if the
  // schedule genuinely changed, staff adjusts the existing invoices in
  // Facturation, where the money now lives.
  const existing = await prisma.invoice.count({
    where: { dossierId: document.dossierId, installmentNumber: { not: null } },
  });
  if (existing > 0) return 0;

  const dossier = await prisma.dossier.findUnique({
    where: { id: document.dossierId },
    select: { contactId: true },
  });
  if (!dossier) return 0;

  // Sequential on purpose: nextInvoiceReference counts existing rows, so
  // creating in parallel would hand several instalments the same reference.
  let created = 0;
  for (const [i, instalment] of schedule.entries()) {
    await prisma.invoice.create({
      data: {
        organizationId: document.organizationId,
        contactId: dossier.contactId,
        dossierId: document.dossierId,
        reference: await nextInvoiceReference(document.organizationId),
        amountCents: instalment.amountCents,
        status: "DRAFT",
        dueDate: new Date(`${instalment.dueDate}T00:00:00.000Z`),
        installmentNumber: i + 1,
        installmentTotal: schedule.length,
        // BPF vocabulary: a contrat_formation is by definition the learner's
        // own money; a convention's schedule is the company's.
        fundingOrigin: document.category === "contrat_formation" ? "individual" : "company",
      },
    });
    created++;
  }
  return created;
}

// Defensive re-parse of Document.paymentSchedule (Json?): it was validated
// by the send route, but a Json column proves nothing at read time. A
// malformed entry drops silently — better no invoice than a wrong one.
function parseStoredSchedule(raw: unknown): { dueDate: string; amountCents: number; label?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is { dueDate: string; amountCents: number; label?: string } =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test((e as { dueDate: string }).dueDate) &&
      typeof (e as Record<string, unknown>).amountCents === "number" &&
      (e as { amountCents: number }).amountCents > 0,
  );
}
