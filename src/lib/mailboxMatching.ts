import { prisma } from "@/lib/prisma";

// Shared by every mailbox sync (Gmail today, IMAP for any other provider)
// so the "which contact/dossier does this message belong to" logic can't
// drift between them — see gmailSync.ts and imapSync.ts.

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
