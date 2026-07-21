import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendGmailReply } from "@/lib/gmailSync";
import { sendImapReply } from "@/lib/imapSync";

const schema = z.object({ body: z.string().min(1).max(10000) });

// Records a reply as a new "out" EmailMessage threaded via inReplyToId. If
// the organization has a connected mailbox (Gmail or generic IMAP/SMTP),
// also actually sends it — otherwise falls back to record-only, same as
// before any mailbox was connected.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const original = await prisma.emailMessage.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!original) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (!original.contactId) {
    return NextResponse.json({ error: "Ce message n'est pas encore rattaché à un contact." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });

  const subject = original.subject.toLowerCase().startsWith("re:") ? original.subject : `Re: ${original.subject}`;

  const [gmailConnection, imapConnection] = await Promise.all([
    prisma.mailboxConnection.findUnique({
      where: { organizationId_provider: { organizationId: session.organizationId, provider: "gmail" } },
    }),
    prisma.mailboxConnection.findUnique({
      where: { organizationId_provider: { organizationId: session.organizationId, provider: "imap" } },
    }),
  ]);
  const connection = gmailConnection ?? imapConnection;

  let sendResult: { externalId: string; externalThreadId: string | null } | null = null;
  let sendError: string | null = null;
  try {
    if (gmailConnection) {
      sendResult = await sendGmailReply(session.organizationId, {
        to: original.fromAddress,
        subject,
        body: parsed.data.body,
        threadId: original.externalThreadId,
      });
    } else if (imapConnection) {
      sendResult = await sendImapReply(session.organizationId, {
        to: original.fromAddress,
        subject,
        body: parsed.data.body,
        inReplyTo: original.externalThreadId,
      });
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Échec de l'envoi.";
  }

  const reply = await prisma.emailMessage.create({
    data: {
      organizationId: session.organizationId,
      contactId: original.contactId,
      fromAddress: connection?.accountEmail ?? session.email,
      subject,
      snippet: parsed.data.body.slice(0, 140),
      body: parsed.data.body,
      receivedAt: new Date(),
      direction: "out",
      inReplyToId: original.id,
      externalId: sendResult?.externalId,
      externalThreadId: sendResult?.externalThreadId,
    },
  });

  return NextResponse.json({ ...reply, delivered: Boolean(sendResult), sendError }, { status: 201 });
}
