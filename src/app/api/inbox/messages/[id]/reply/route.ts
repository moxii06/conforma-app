import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";

const schema = z.object({ body: z.string().min(1).max(10000) });

// Records a reply as a new "out" EmailMessage threaded via inReplyToId — no
// real delivery happens, same constraint as the rest of the mailbox module
// (no OAuth mailbox is actually connected). This still gives staff a real,
// persisted record of what was said and when, visible in the dossier's
// Emails tab and to teammates reading the same thread.
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

  const reply = await prisma.emailMessage.create({
    data: {
      organizationId: session.organizationId,
      contactId: original.contactId,
      fromAddress: session.email,
      subject,
      snippet: parsed.data.body.slice(0, 140),
      body: parsed.data.body,
      receivedAt: new Date(),
      direction: "out",
      inReplyToId: original.id,
    },
  });

  return NextResponse.json(reply, { status: 201 });
}
