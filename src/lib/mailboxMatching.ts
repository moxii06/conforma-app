import { prisma } from "@/lib/prisma";
import { uploadEmailAttachment } from "@/lib/storage";

// Shared by every mailbox sync (Gmail today, IMAP for any other provider)
// so the "which contact/dossier does this message belong to" logic can't
// drift between them — see gmailSync.ts and imapSync.ts.

// Persists whatever attachment bytes a sync already pulled off a message —
// imapSync.ts gets them for free from mailparser's parsed.attachments;
// gmailSync.ts fetches each part's bytes via a follow-up attachments.get
// call. Best-effort per file, same shape as the RGPD classification call
// below in each sync: a storage hiccup (or BLOB_PRIVATE_READ_WRITE_TOKEN
// simply not configured yet) skips that one attachment rather than losing
// the whole message.
export async function persistEmailAttachments(params: {
  organizationId: string;
  messageId: string;
  attachments: { filename: string; mimeType: string; content: Buffer }[];
}): Promise<void> {
  for (const a of params.attachments) {
    if (!a.filename || a.content.length === 0) continue;
    try {
      const file = new File([new Uint8Array(a.content)], a.filename, { type: a.mimeType || undefined });
      const uploaded = await uploadEmailAttachment({
        organizationId: params.organizationId,
        messageId: params.messageId,
        file,
      });
      await prisma.emailAttachment.create({
        data: {
          emailMessageId: params.messageId,
          fileName: uploaded.fileName,
          fileUrl: uploaded.url,
          fileSizeBytes: uploaded.sizeBytes,
          mimeType: a.mimeType || null,
        },
      });
    } catch (err) {
      console.error(`Pièce jointe non enregistrée (${a.filename}):`, err);
    }
  }
}

// Both syncs fall back to this when a message has no text/plain part —
// common for marketing/automated senders. A blind `<[^>]+>` strip leaves
// <style>/<script> block *contents* behind as visible text (the raw CSS
// rules a client S6 report caught in the snippet), because stripping the
// tags doesn't remove what was between them. Comments go too — Outlook's
// mso-conditional blocks (`<!--[if mso]>...<![endif]-->`) are HTML comments
// wrapping more markup, not real message content.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getAlreadyImportedIds(organizationId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.emailMessage.findMany({
    where: { organizationId, externalId: { in: candidateIds } },
    select: { externalId: true },
  });
  return new Set(rows.map((r) => r.externalId as string));
}

export type ContactDossierMatcher = {
  matchContact(fromAddress: string): string | null;
  // Dossier suggestion — two heuristics, matching the "thread" | "reference"
  // basis the schema already anticipates:
  //  - "thread": this message's conversation thread already led somewhere
  //    for a prior message (another email in the same thread was already
  //    resolved to a dossier) — reuse that.
  //  - "reference": the contact only has one Dossier, so it's the only
  //    sensible candidate even with no thread history yet.
  // A contact with several dossiers and no thread signal gets no
  // suggestion — better to leave it to a human than guess wrong.
  matchDossier(
    contactId: string | null,
    threadId: string | null
  ): { suggestedDossierId: string | null; matchBasis: string | null };
};

export async function createContactDossierMatcher(organizationId: string): Promise<ContactDossierMatcher> {
  const contacts = await prisma.contact.findMany({ where: { organizationId }, select: { id: true, email: true } });
  const contactByEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c.id]));

  const dossiers = await prisma.dossier.findMany({ where: { organizationId }, select: { id: true, contactId: true } });
  const dossiersByContact = new Map<string, string[]>();
  for (const d of dossiers) {
    dossiersByContact.set(d.contactId, [...(dossiersByContact.get(d.contactId) ?? []), d.id]);
  }

  const priorThreadDossiers = await prisma.emailMessage.findMany({
    where: { organizationId, externalThreadId: { not: null }, suggestedDossierId: { not: null } },
    select: { externalThreadId: true, suggestedDossierId: true },
  });
  const threadToDossier = new Map<string, string>(
    priorThreadDossiers.map((m) => [m.externalThreadId as string, m.suggestedDossierId as string])
  );

  return {
    matchContact(fromAddress: string) {
      return contactByEmail.get(fromAddress.toLowerCase()) ?? null;
    },
    matchDossier(contactId, threadId) {
      if (!contactId) return { suggestedDossierId: null, matchBasis: null };
      const threadMatch = threadId ? threadToDossier.get(threadId) : undefined;
      const contactDossiers = dossiersByContact.get(contactId) ?? [];

      let suggestedDossierId: string | null = null;
      let matchBasis: string | null = null;
      if (threadMatch) {
        suggestedDossierId = threadMatch;
        matchBasis = "thread";
      } else if (contactDossiers.length === 1) {
        suggestedDossierId = contactDossiers[0];
        matchBasis = "reference";
      }
      if (suggestedDossierId && threadId) threadToDossier.set(threadId, suggestedDossierId);

      return { suggestedDossierId, matchBasis };
    },
  };
}
