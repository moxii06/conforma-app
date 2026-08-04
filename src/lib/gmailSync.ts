import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  getAlreadyImportedIds,
  createContactDossierMatcher,
  htmlToPlainText,
  decodeHtmlEntities,
  persistEmailAttachments,
} from "@/lib/mailboxMatching";
import { classifyEmailForRgpd } from "@/lib/ai";
import { buildRawMimeMessage, type OutgoingAttachment } from "@/lib/emailMime";
import type { MailboxConnection } from "@prisma/client";

const MAX_MESSAGES_PER_SYNC = 25;

// Refreshes the access token via the stored refresh_token — called before
// every Gmail API request rather than tracking expiry, since access tokens
// are short-lived (~1h) and a refresh call is cheap. Also re-persists the
// new access token (encrypted) so MailboxConnection stays current for
// debugging, though refreshToken is what's actually load-bearing here.
async function getValidAccessToken(connection: MailboxConnection): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/SECRET non configurés.");
  if (!connection.refreshTokenEncrypted) throw new Error("Connexion Gmail invalide (aucun refresh token stocké).");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decrypt(connection.refreshTokenEncrypted),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error("Impossible de rafraîchir le token Google — la connexion a peut-être été révoquée.");
  }
  const data = (await res.json()) as { access_token: string };

  await prisma.mailboxConnection.update({
    where: { id: connection.id },
    data: { accessTokenEncrypted: encrypt(data.access_token) },
  });

  return data.access_token;
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  payload: { headers: GmailHeader[] } & GmailPart;
};
type GmailAttachmentPart = { filename: string; mimeType: string; attachmentId: string };

// A real attachment part carries both a filename and an attachmentId (its
// bytes are too large to inline as body.data, unlike the text/plain or
// text/html parts extractBody walks) — inline body parts have neither, so
// this can share the same MIME-tree walk shape without extractBody's
// text/plain-first preference mattering here.
function extractAttachmentParts(part: GmailPart): GmailAttachmentPart[] {
  const found: GmailAttachmentPart[] = [];
  if (part.filename && part.body?.attachmentId) {
    found.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId });
  }
  if (part.parts) {
    for (const child of part.parts) found.push(...extractAttachmentParts(child));
  }
  return found;
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function findMimePart(part: GmailPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = findMimePart(child, mimeType);
      if (found) return found;
    }
  }
  return null;
}

// Gmail messages are either a flat body or a MIME tree — walk it for both
// text/html and text/plain, and prefer the HTML one (converted via
// htmlToPlainText) when present. The auto-generated text/plain fallback
// most ESP templates ship (Mailchimp, Braze, Sendgrid...) is meant as a
// last resort for clients that can't render HTML at all, not for reading —
// it commonly renders every link as "Label (https://tracking-url...)",
// which is exactly the "email banner (https://...)" junk real inbound
// marketing mail showed up with. A genuine plain-text-only personal email
// (no HTML part at all) still falls back to its own text, decoded.
function extractBody(part: GmailPart): string {
  const html = findMimePart(part, "text/html");
  if (html) return htmlToPlainText(html);
  const plain = findMimePart(part, "text/plain");
  return plain ? decodeHtmlEntities(plain) : "";
}

function extractFromAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

// "Jean Dupont <jean.dupont@x.fr>" -> "Jean Dupont"; a bare address (no
// display name) has nothing to extract, so this returns "". Used to
// pre-fill the "Nouveau prospect" quick-create form for unmatched senders
// — a real value taken straight from the email header, not an AI guess.
function extractFromName(fromHeader: string): string {
  const match = fromHeader.match(/^"?([^"<]*)"?\s*<[^>]+>$/);
  return (match ? match[1] : "").trim();
}

export async function syncGmailMailbox(organizationId: string, connectionId: string): Promise<{ imported: number }> {
  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: connectionId, organizationId, provider: "gmail" },
  });
  if (!connection) throw new Error("Boîte Gmail introuvable pour cette organisation.");

  const accessToken = await getValidAccessToken(connection);
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=${MAX_MESSAGES_PER_SYNC}`,
    { headers: authHeader }
  );
  if (!listRes.ok) throw new Error("Échec de la liste des messages Gmail.");
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const candidateIds = (list.messages ?? []).map((m) => m.id);
  if (candidateIds.length === 0) return { imported: 0 };

  const alreadyImportedIds = await getAlreadyImportedIds(organizationId, candidateIds);
  const newIds = candidateIds.filter((id) => !alreadyImportedIds.has(id));

  const matcher = await createContactDossierMatcher(organizationId);

  // Fetched in parallel — sequentially awaiting one HTTP round-trip per
  // message (up to MAX_MESSAGES_PER_SYNC of them) was slow enough to blow
  // past Vercel's serverless function timeout on a first sync (Hobby plan
  // caps at 10s; 25 sequential ~300-500ms Gmail API calls alone eats most
  // of that before any parsing/DB work even starts). Matching still
  // happens in original order afterward so the thread-continuity
  // heuristic (matcher.matchDossier) stays deterministic.
  const fetchedMessages = await Promise.all(
    newIds.map(async (id) => {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: authHeader,
      });
      if (!msgRes.ok) return null;
      return (await msgRes.json()) as GmailMessage;
    })
  );

  // Field extraction happens once per message here (not inline in the
  // insert loop below) so the RGPD classification pass — also parallel,
  // also best-effort — can reuse the same subject/body without redoing the
  // MIME walk twice.
  const parsedMessages = fetchedMessages.map((message) => {
    if (!message) return null;
    const fromHeader = headerValue(message.payload.headers, "From");
    const subject = headerValue(message.payload.headers, "Subject") || "(sans objet)";
    const dateHeader = headerValue(message.payload.headers, "Date");
    const fromAddress = extractFromAddress(fromHeader);
    const fromName = extractFromName(fromHeader);
    const body = extractBody(message.payload);
    const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
    const attachmentParts = extractAttachmentParts(message.payload);
    return { message, subject, fromAddress, fromName, body, receivedAt, attachmentParts };
  });

  // Best-effort, never blocks a sync from completing — a classification
  // failure (quota, transient error) just means that message gets no RGPD
  // suggestion rather than aborting the whole sync.
  const classifications = await Promise.all(
    parsedMessages.map(async (p) => {
      if (!p) return null;
      try {
        return await classifyEmailForRgpd({ subject: p.subject, body: p.body });
      } catch {
        return null;
      }
    })
  );

  let imported = 0;
  for (let i = 0; i < parsedMessages.length; i++) {
    const parsed = parsedMessages[i];
    if (!parsed) continue;
    const { message, subject, fromAddress, fromName, body, receivedAt, attachmentParts } = parsed;
    const classification = classifications[i];

    const contactId = matcher.matchContact(fromAddress);
    const { suggestedDossierId, matchBasis } = matcher.matchDossier(contactId, message.threadId);

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
        externalId: message.id,
        externalThreadId: message.threadId,
        receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
        direction: "in",
      },
    });

    // Each attachment part only carries an id here — Gmail requires a
    // separate call per attachment to get its bytes (unlike IMAP, where
    // mailparser already handed them over). Best-effort: a failure here
    // never rolls back the message import above.
    if (attachmentParts.length > 0) {
      try {
        const fetched = await Promise.all(
          attachmentParts.map(async (part) => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${part.attachmentId}`,
              { headers: authHeader }
            );
            if (!res.ok) return null;
            const attachmentBody = (await res.json()) as { data: string };
            return { filename: part.filename, mimeType: part.mimeType, content: Buffer.from(attachmentBody.data, "base64url") };
          })
        );
        await persistEmailAttachments({
          organizationId,
          messageId: created.id,
          attachments: fetched.filter((a): a is NonNullable<typeof a> => a !== null),
        });
      } catch (err) {
        console.error(`Pièces jointes non récupérées pour le message ${message.id} :`, err);
      }
    }

    imported += 1;
  }

  await prisma.mailboxConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });

  return { imported };
}

// Sends a real reply through the connected Gmail account — used by
// /api/inbox/messages/[id]/reply when a mailbox is connected, falling back
// to record-only behavior otherwise. threadId keeps the reply in the same
// Gmail conversation as the message it answers, when known. Sends from the
// SAME connection that received the original message (see the reply
// route) rather than "whichever Gmail account the org has," now that an
// org can have several.
export async function sendGmailReply(
  connectionId: string,
  params: {
    to: string;
    subject: string;
    body: string;
    html?: string;
    attachments?: OutgoingAttachment[];
    threadId?: string | null;
  }
): Promise<{ externalId: string; externalThreadId: string }> {
  const connection = await prisma.mailboxConnection.findFirst({
    where: { id: connectionId, provider: "gmail" },
  });
  if (!connection) throw new Error("Boîte Gmail introuvable.");

  const accessToken = await getValidAccessToken(connection);

  const raw = (
    await buildRawMimeMessage({
      from: connection.accountEmail,
      to: params.to,
      subject: params.subject,
      text: params.body,
      html: params.html,
      attachments: params.attachments,
    })
  ).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(params.threadId ? { raw, threadId: params.threadId } : { raw }),
  });
  if (!res.ok) throw new Error("Échec de l'envoi via Gmail.");
  const sent = (await res.json()) as { id: string; threadId: string };
  return { externalId: sent.id, externalThreadId: sent.threadId };
}
