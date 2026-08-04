import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendGmailReply } from "@/lib/gmailSync";
import { sendImapReply } from "@/lib/imapSync";
import { fillMergeTags } from "@/lib/mergeTags";
import { htmlToPlainText, persistEmailAttachments } from "@/lib/mailboxMatching";
import { mergeTemplate } from "@/lib/mergeTemplate";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { fetchStoredFileBuffer } from "@/lib/blobStream";
import type { OutgoingAttachment } from "@/lib/emailMime";

function parseIdArray(raw: FormDataEntryValue | null): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Records a reply as a new "out" EmailMessage threaded via inReplyToId. If
// the original message came in through a connected mailbox (Gmail or
// generic IMAP/SMTP), sends the reply through that SAME mailbox — an org
// can have several connected, so "the org's mailbox" isn't well-defined
// any more; the one that received the message is. Falls back to
// record-only if the original has no mailboxConnectionId (seed/demo data,
// or a message from before multi-mailbox support) or the send fails.
//
// A contact link is no longer required (inbox-triage split view can reply
// straight from "À trier", before any prospect exists) — merge tags
// ([Prénom]/[Nom]/[Organisme]) only apply when one is present, and the
// reply always goes to the original message's fromAddress regardless.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const original = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { mailboxConnection: true, contact: true },
  });
  if (!original) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });

  const formData = await request.formData();
  const bodyHtml = formData.get("bodyHtml");
  if (typeof bodyHtml !== "string" || htmlToPlainText(bodyHtml).length === 0) {
    return NextResponse.json({ error: "Message vide." }, { status: 400 });
  }
  if (bodyHtml.length > 50_000) {
    return NextResponse.json({ error: "Message trop long." }, { status: 400 });
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const filledHtml = original.contact
    ? fillMergeTags(bodyHtml, {
        firstName: original.contact.firstName,
        lastName: original.contact.lastName,
        organizationName: organization.name,
      })
    : bodyHtml;
  const filledText = htmlToPlainText(filledHtml);

  // ---- Attachments: uploaded files, existing Documents on file for this
  // contact, and templates rendered fresh (organization+contact merge
  // fields only — no dossier context here, see InboxReplyDialog). ----
  const outgoing: OutgoingAttachment[] = [];
  const forStorage: { filename: string; mimeType: string; content: Buffer }[] = [];

  for (const entry of formData.getAll("files")) {
    if (entry instanceof File && entry.size > 0) {
      const content = Buffer.from(await entry.arrayBuffer());
      outgoing.push({ filename: entry.name, content, contentType: entry.type || undefined });
      forStorage.push({ filename: entry.name, mimeType: entry.type, content });
    }
  }

  const existingDocumentIds = parseIdArray(formData.get("existingDocumentIds"));
  if (existingDocumentIds.length > 0) {
    const documents = await prisma.document.findMany({
      where: {
        id: { in: existingDocumentIds },
        organizationId: session.organizationId,
        ...(original.contactId ? { contactId: original.contactId } : {}),
      },
    });
    for (const doc of documents) {
      try {
        let content: Buffer;
        let contentType = "application/pdf";
        if (doc.fileUrl) {
          const fetched = await fetchStoredFileBuffer(doc.fileUrl);
          if (!fetched) continue;
          content = fetched.buffer;
          contentType = fetched.contentType;
        } else if (doc.bodyText) {
          content = await generatePdfFromRichText(doc.title, plainTextToHtml(doc.bodyText));
        } else {
          continue;
        }
        const filename = doc.fileUrl ? doc.fileUrl.split("/").pop() || `${doc.title}.pdf` : `${doc.title}.pdf`;
        outgoing.push({ filename, content, contentType });
        forStorage.push({ filename, mimeType: contentType, content });
      } catch (err) {
        console.error(`Pièce jointe (document existant) non préparée (${doc.id}):`, err);
      }
    }
  }

  const templateIds = parseIdArray(formData.get("templateIds"));
  if (templateIds.length > 0 && original.contact) {
    const templates = await prisma.documentTemplate.findMany({
      where: {
        id: { in: templateIds },
        OR: [{ organizationId: session.organizationId }, { organizationId: null }],
      },
      include: { _count: { select: { blocks: true } } },
    });
    for (const template of templates) {
      if (template._count.blocks > 0) continue; // conditional templates need dossier context — not available here
      try {
        const merged = mergeTemplate(template.bodyText, {
          contact: original.contact,
          organization: {
            name: organization.name,
            legalForm: organization.legalForm,
            shareCapital: organization.shareCapital,
            legalAddress: organization.legalAddress,
            rcsCity: organization.rcsCity,
            rcsNumber: organization.rcsNumber,
            siret: organization.siret,
            legalRepresentativeName: organization.legalRepresentativeName,
            activityDeclarationNumber: organization.activityDeclarationNumber,
            publicContactEmail: organization.publicContactEmail,
            publicContactPhone: organization.publicContactPhone,
            regionPrefecture: organization.regionPrefecture,
            mediatorName: organization.mediatorName,
            mediatorContact: organization.mediatorContact,
            cancellationFeePercent: organization.cancellationFeePercent,
          },
        });
        const content = await generatePdfFromRichText(template.title, plainTextToHtml(merged));
        const filename = `${template.title.replace(/[^\w\- ]/g, "").slice(0, 80) || "document"}.pdf`;
        outgoing.push({ filename, content, contentType: "application/pdf" });
        forStorage.push({ filename, mimeType: "application/pdf", content });
      } catch (err) {
        console.error(`Pièce jointe (modèle) non générée (${template.id}):`, err);
      }
    }
  }

  const subject = original.subject.toLowerCase().startsWith("re:") ? original.subject : `Re: ${original.subject}`;
  const connection = original.mailboxConnection;

  let sendResult: { externalId: string; externalThreadId: string | null } | null = null;
  let sendError: string | null = null;
  try {
    if (connection?.provider === "gmail") {
      sendResult = await sendGmailReply(connection.id, {
        to: original.fromAddress,
        subject,
        body: filledText,
        html: filledHtml,
        attachments: outgoing,
        threadId: original.externalThreadId,
      });
    } else if (connection?.provider === "imap") {
      sendResult = await sendImapReply(connection.id, {
        to: original.fromAddress,
        subject,
        body: filledText,
        html: filledHtml,
        attachments: outgoing,
        inReplyTo: original.externalThreadId,
      });
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Échec de l'envoi.";
  }

  const reply = await prisma.emailMessage.create({
    data: {
      organizationId: session.organizationId,
      mailboxConnectionId: connection?.id,
      contactId: original.contactId,
      fromAddress: connection?.accountEmail ?? session.email,
      subject,
      snippet: filledText.slice(0, 140),
      body: filledText,
      receivedAt: new Date(),
      direction: "out",
      inReplyToId: original.id,
      externalId: sendResult?.externalId,
      externalThreadId: sendResult?.externalThreadId,
    },
  });

  if (forStorage.length > 0) {
    await persistEmailAttachments({ organizationId: session.organizationId, messageId: reply.id, attachments: forStorage });
  }

  return NextResponse.json({ ...reply, delivered: Boolean(sendResult), sendError }, { status: 201 });
}
