import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";

const schema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

// Generic "send an email to this contact" action for the unified CRM
// contact record's intent composer — distinct from the dossier outreach
// route (contract/convocation/platform_access), which generates a document
// or a portal account alongside the email. This one is just a message: it
// logs a ClientOutreach row (type "message") so it shows up in the
// record's communications history, same non-fatal-send pattern as outreach.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: auth.organizationId },
    include: { opportunities: { select: { ownerId: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  if (!canAccessContact(auth.role, auth.userId, contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Sujet et message requis." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const sentByName = auth.name || auth.email;

  const outreach = await prisma.clientOutreach.create({
    data: {
      organizationId: auth.organizationId,
      contactId: contact.id,
      type: "message",
      status: "acknowledged",
      acknowledgedAt: new Date(),
      sentByUserId: auth.userId,
      sentByName,
    },
  });

  const mergeCtx = { firstName: contact.firstName, lastName: contact.lastName, organizationName: organization.name };

  let emailSent = false;
  try {
    await sendTransactionalEmail({
      to: contact.email,
      toName: `${contact.firstName} ${contact.lastName}`,
      subject: fillMergeTags(parsed.data.subject, mergeCtx),
      text: fillMergeTags(parsed.data.body, mergeCtx),
      senderName: organization.name,
      replyTo: auth.email,
    });
    emailSent = true;
  } catch {
    // Non-fatal — outreach record still exists, UI surfaces the failure.
  }

  return NextResponse.json({ outreach, emailSent }, { status: 201 });
}
