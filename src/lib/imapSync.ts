import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getAlreadyImportedIds, createContactDossierMatcher } from "@/lib/mailboxMatching";
import type { MailboxConnection } from "@prisma/client";

const MAX_MESSAGES_PER_SYNC = 25;

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

export async function syncImapMailbox(organizationId: string): Promise<{ imported: number }> {
  const connection = await prisma.mailboxConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: "imap" } },
  });
  if (!connection) throw new Error("Aucune boîte IMAP connectée pour cette organisation.");

  const client = await openClient(connection);
  let imported = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidValidity = client.mailbox && "uidValidity" in client.mailbox ? client.mailbox.uidValidity : 0n;
      const total = client.mailbox && "exists" in client.mailbox ? client.mailbox.exists : 0;
      if (total === 0) return { imported: 0 };

      const from = Math.max(1, total - MAX_MESSAGES_PER_SYNC + 1);
      const candidateUids: number[] = [];
      for await (const msg of client.fetch(`${from}:${total}`, { uid: true })) {
        candidateUids.push(msg.uid);
      }
      if (candidateUids.length === 0) return { imported: 0 };

      const candidateExternalIds = candidateUids.map((uid) => `imap-${uidValidity}-${uid}`);
      const alreadyImportedIds = await getAlreadyImportedIds(organizationId, candidateExternalIds);
      const newUids = candidateUids.filter((uid) => !alreadyImportedIds.has(`imap-${uidValidity}-${uid}`));
      if (newUids.length === 0) return { imported: 0 };

      const matcher = await createContactDossierMatcher(organizationId);

      for await (const msg of client.fetch(newUids, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);

        const fromAddress = (parsed.from?.value[0]?.address ?? "").toLowerCase();
        if (!fromAddress) continue;
        const fromName = parsed.from?.value[0]?.name ?? "";
        const subject = parsed.subject || "(sans objet)";
        const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
        const receivedAt = parsed.date ?? new Date();
        const threadId = parsed.references?.[0] ?? parsed.inReplyTo ?? parsed.messageId ?? null;

        const contactId = matcher.matchContact(fromAddress);
        const { suggestedDossierId, matchBasis } = matcher.matchDossier(contactId, threadId);

        await prisma.emailMessage.create({
          data: {
            organizationId,
            contactId,
            suggestedDossierId,
            matchBasis,
            fromAddress,
            fromName: fromName || null,
            subject,
            snippet: body.slice(0, 140),
            body: body || null,
            externalId: `imap-${uidValidity}-${msg.uid}`,
            externalThreadId: threadId,
            receivedAt,
            direction: "in",
          },
        });
        imported += 1;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  await prisma.mailboxConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });

  return { imported };
}

// Sends a real reply through SMTP for a connected IMAP mailbox — same role
// as sendGmailReply() for Gmail. inReplyTo/references keep the reply
// threaded in mail clients that honor those headers (most do), the closest
// generic-SMTP equivalent to Gmail's threadId mechanism.
export async function sendImapReply(
  organizationId: string,
  params: { to: string; subject: string; body: string; inReplyTo?: string | null }
): Promise<{ externalId: string; externalThreadId: string | null }> {
  const connection = await prisma.mailboxConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: "imap" } },
  });
  if (!connection) throw new Error("Aucune boîte IMAP connectée pour cette organisation.");
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
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo, references: params.inReplyTo } : {}),
  });

  return { externalId: info.messageId, externalThreadId: params.inReplyTo ?? info.messageId };
}
