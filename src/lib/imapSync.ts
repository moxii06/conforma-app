import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  getAlreadyImportedIds,
  createContactDossierMatcher,
  linkOrphanEmailsToKnownContacts,
  htmlToPlainText,
  decodeHtmlEntities,
  persistEmailAttachments,
} from "@/lib/mailboxMatching";
import { sanitizeEmailHtml } from "@/lib/emailHtml";
import { classifyEmailForRgpd } from "@/lib/ai";
import type { OutgoingAttachment } from "@/lib/emailMime";
import type { MailboxConnection } from "@prisma/client";

const MAX_MESSAGES_PER_SYNC = 25;
// Rattrapage initial — mêmes valeurs que gmailSync.ts, voir le commentaire
// détaillé là-bas.
const BACKFILL_DAYS = 90;
const MAX_MESSAGES_PER_BACKFILL = 40;

async function markBackfilled(connectionId: string) {
  await prisma.mailboxConnection.update({ where: { id: connectionId }, data: { backfilledAt: new Date() } });
}

function requireImapFields(connection: MailboxConnection) {
  if (!connection.passwordEncrypted || !connection.imapHost || !connection.imapPort) {
    throw new Error("Connexion IMAP incomplète — reconnectez la boîte depuis /integrations.");
  }
  return {
    password: decrypt(connection.passwordEncrypted),
    host: connection.imapHost,
    port: connection.imapPort,
  };
}

async function openClient(connection: MailboxConnection): Promise<ImapFlow> {
  const { password, host, port } = requireImapFields(connection);
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user: connection.accountEmail, pass: password },
    logger: false,
  });
  await client.connect();
  return client;
}

// Lecture IMAP proprement dite, sous verrou de boîte : renvoie le nombre de
// messages réellement importés.
//
// Extraite de syncImapMailbox pour une seule raison, mais elle est de
// taille : ses sorties anticipées (boîte vide, aucun candidat, rien de
// nouveau) sont des passages RÉUSSIS qui n'avaient simplement rien à
// importer. Tant qu'elles étaient des `return` de la fonction publique,
// elles sautaient la datation de fin — or « rien de nouveau » est le cas
// NOMINAL d'une boîte suivie au quotidien. L'appelant date maintenant
// toujours, quelle que soit la sortie prise ici.
async function importerNouveauxMessages(
  client: ImapFlow,
  connection: MailboxConnection,
  organizationId: string,
  backfilling: boolean
): Promise<number> {
  let imported = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uidValidity = client.mailbox && "uidValidity" in client.mailbox ? client.mailbox.uidValidity : 0n;
    const total = client.mailbox && "exists" in client.mailbox ? client.mailbox.exists : 0;
    if (total === 0) {
      if (backfilling) await markBackfilled(connection.id);
      return 0;
    }

    let candidateUids: number[] = [];
    // Un SEARCH refusé par le serveur renvoie `false` (pas un tableau
    // vide) : on ne peut pas le confondre avec « rien depuis 90 jours »,
    // sinon on marquerait le rattrapage terminé sans avoir rien lu.
    let searchRefused = false;
    if (backfilling) {
      // SEARCH SINCE côté serveur : c'est lui qui filtre, on ne rapatrie
      // pas toute la boîte pour trier ensuite.
      const since = new Date(Date.now() - BACKFILL_DAYS * 86_400_000);
      const found = await client.search({ since }, { uid: true });
      if (found === false) searchRefused = true;
      else candidateUids = found;
    }
    if (!backfilling || searchRefused) {
      // Fenêtre récente : le fonctionnement normal, et le repli si le
      // serveur n'a pas honoré la recherche par date.
      const from = Math.max(1, total - MAX_MESSAGES_PER_SYNC + 1);
      for await (const msg of client.fetch(`${from}:${total}`, { uid: true })) {
        candidateUids.push(msg.uid);
      }
    }
    if (candidateUids.length === 0) {
      // Rattrapage marqué fait seulement si la recherche a réellement
      // répondu « rien » — un refus laisse backfilledAt à NULL pour
      // retenter au prochain passage.
      if (backfilling && !searchRefused) await markBackfilled(connection.id);
      return 0;
    }

    const candidateExternalIds = candidateUids.map((uid) => `imap-${uidValidity}-${uid}`);
    const alreadyImportedIds = await getAlreadyImportedIds(organizationId, candidateExternalIds);
    const allNewUids = candidateUids.filter((uid) => !alreadyImportedIds.has(`imap-${uidValidity}-${uid}`));
    // Les plus récents d'abord pendant le rattrapage, le reste au passage
    // suivant — même logique par lots que Gmail.
    const newUids =
      backfilling && !searchRefused
        ? [...allNewUids].sort((a, b) => b - a).slice(0, MAX_MESSAGES_PER_BACKFILL)
        : allNewUids;
    if (backfilling && !searchRefused && allNewUids.length <= MAX_MESSAGES_PER_BACKFILL) {
      await markBackfilled(connection.id);
    }
    if (newUids.length === 0) return 0;

    const matcher = await createContactDossierMatcher(organizationId);

    for await (const msg of client.fetch(newUids, { uid: true, source: true }, { uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);

      const fromAddress = (parsed.from?.value[0]?.address ?? "").toLowerCase();
      if (!fromAddress) continue;
      const fromName = parsed.from?.value[0]?.name ?? "";
      const subject = parsed.subject || "(sans objet)";
      // Same precedence flip as gmailSync.ts's extractBody: prefer the
      // HTML part (converted) over the sender's own auto-generated
      // text/plain fallback, which for template-based senders is often
      // worse (raw "Label (https://...)" links, undecoded entities).
      const body = parsed.html ? htmlToPlainText(parsed.html) : decodeHtmlEntities(parsed.text || "");
      // Et la version affichable, assainie — même raison que côté Gmail :
      // n'en garder que le texte aplati, c'est perdre les paragraphes.
      const bodyHtml = parsed.html ? sanitizeEmailHtml(parsed.html) : null;
      const receivedAt = parsed.date ?? new Date();
      const threadId = parsed.references?.[0] ?? parsed.inReplyTo ?? parsed.messageId ?? null;

      const contactId = matcher.matchContact(fromAddress);
      const { suggestedDossierId, matchBasis } = matcher.matchDossier(contactId, threadId);

      // Best-effort, same as gmailSync.ts — a classification failure
      // never blocks the message from being imported.
      const classification = await classifyEmailForRgpd({ subject, body }).catch(() => null);

      const created = await prisma.emailMessage.create({
        data: {
          organizationId,
          mailboxConnectionId: connection.id,
          contactId,
          suggestedDossierId,
          rgpdClassifiedAt: classification ? new Date() : null,
          rgpdSuggestedType: classification?.isRightsRequest ? classification.requestType : null,
          rgpdReasoning: classification?.isRightsRequest ? classification.reasoning : null,
          matchBasis,
          fromAddress,
          fromName: fromName || null,
          subject,
          snippet: body.slice(0, 140),
          body: body || null,
          bodyHtml,
          externalId: `imap-${uidValidity}-${msg.uid}`,
          externalThreadId: threadId,
          receivedAt,
          direction: "in",
        },
      });

      // mailparser already decoded these — real attachments only, not
      // inline signature logos/tracking pixels (contentDisposition
      // distinguishes the two).
      const realAttachments = (parsed.attachments ?? []).filter((a) => a.contentDisposition === "attachment" && a.filename);
      if (realAttachments.length > 0) {
        await persistEmailAttachments({
          organizationId,
          messageId: created.id,
          attachments: realAttachments.map((a) => ({
            filename: a.filename as string,
            mimeType: a.contentType,
            content: a.content,
          })),
        });
      }

      imported += 1;
    }
  } finally {
    lock.release();
  }
  return imported;
}

export async function syncImapMailbox(organizationId: string, connectionId: string): Promise<{ imported: number }> {
  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: connectionId, organizationId, provider: "imap" },
  });
  if (!connection) throw new Error("Boîte IMAP introuvable pour cette organisation.");
  // Boîte décochée : rien n'est récupéré, les messages déjà importés restent.
  // Seule sortie qui ne date PAS le passage : une boîte en pause n'a
  // effectivement pas été relevée, la dater laisserait croire l'inverse.
  if (!connection.syncEnabled) return { imported: 0 };

  // Même rattrapage initial que pour Gmail — voir gmailSync.ts.
  const backfilling = connection.backfilledAt === null;

  const client = await openClient(connection);
  let imported = 0;
  try {
    imported = await importerNouveauxMessages(client, connection, organizationId, backfilling);
  } finally {
    await client.logout().catch(() => {});
  }

  // Daté à chaque passage abouti, y compris quand il n'a rien rapporté :
  // « aucun nouveau message depuis hier » est le cas courant d'une boîte
  // suivie, pas une panne. Sans cela /integrations affichait la date de la
  // dernière ARRIVÉE d'email au lieu de celle du dernier relevé, et une
  // boîte IMAP calme paraissait à l'arrêt à côté d'une Gmail active.
  // Une exception lancée plus haut ne passe pas ici — un échec réel ne doit
  // toujours pas se dater.
  await prisma.mailboxConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });

  // Même rattrapage rétroactif que pour Gmail — et pour la même raison hors
  // du chemin « il y a du nouveau » : un contact créé aujourd'hui doit
  // récupérer ses emails orphelins au prochain passage, même vide.
  await linkOrphanEmailsToKnownContacts(organizationId);

  return { imported };
}

// Sends a real reply through SMTP for a connected IMAP mailbox — same role
// as sendGmailReply() for Gmail. inReplyTo/references keep the reply
// threaded in mail clients that honor those headers (most do), the closest
// generic-SMTP equivalent to Gmail's threadId mechanism. Sends from the
// SAME connection that received the original message (see the reply
// route), now that an org can have several.
export async function sendImapReply(
  connectionId: string,
  params: {
    to: string;
    subject: string;
    body: string;
    html?: string;
    attachments?: OutgoingAttachment[];
    inReplyTo?: string | null;
  }
): Promise<{ externalId: string; externalThreadId: string | null }> {
  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: connectionId, provider: "imap" },
  });
  if (!connection) throw new Error("Boîte IMAP introuvable.");
  if (!connection.passwordEncrypted || !connection.smtpHost || !connection.smtpPort) {
    throw new Error("Connexion IMAP incomplète — reconnectez la boîte depuis /integrations.");
  }

  const transporter = nodemailer.createTransport({
    host: connection.smtpHost,
    port: connection.smtpPort,
    secure: connection.smtpPort === 465,
    auth: { user: connection.accountEmail, pass: decrypt(connection.passwordEncrypted) },
  });

  const info = await transporter.sendMail({
    from: connection.accountEmail,
    to: params.to,
    subject: params.subject,
    text: params.body,
    html: params.html,
    attachments: params.attachments,
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo, references: params.inReplyTo } : {}),
  });

  return { externalId: info.messageId, externalThreadId: params.inReplyTo ?? info.messageId };
}
