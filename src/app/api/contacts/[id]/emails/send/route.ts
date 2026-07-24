import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags, type MergeTagContext } from "@/lib/mergeTags";
import { getPlainTextSignature, appendSignature } from "@/lib/emailSignature";

const schema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  dossierId: z.string().optional(),
  includeSignature: z.boolean().optional(),
});

// A brand-new outgoing email to a contact — not a reply to anything (see
// /api/inbox/messages/[id]/reply for that). Same "inbox" permission as the
// Emails tab that renders NewEmailComposer, on both the dossier record and
// the CRM contact record — one route, two entry points, so a message
// composed from either shows up in the same thread either way. Recorded as
// an EmailMessage (direction "out", no mailboxConnectionId since it goes
// out via Brevo rather than a connected mailbox) so it appears inline with
// any real inbound/outbound thread already there.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.role, "inbox") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: params.id, organizationId: auth.organizationId } });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

  // With a dossierId (composed from the dossier record), the learner's
  // formation/session is in scope too; from the CRM contact record there's
  // no single session to point at, so only the contact/org tags apply.
  const mergeCtx: MergeTagContext = { firstName: contact.firstName, lastName: contact.lastName, organizationName: organization.name };
  if (parsed.data.dossierId) {
    const dossier = await prisma.dossier.findFirst({
      where: { id: parsed.data.dossierId, organizationId: auth.organizationId, contactId: contact.id },
      include: { session: { include: { course: true } } },
    });
    if (dossier) {
      mergeCtx.courseTitle = dossier.session.course.title;
      mergeCtx.sessionDateLabel =
        dossier.session.mode === "ROLLING"
          ? "formation en continu"
          : dossier.session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    }
  }

  const signature = parsed.data.includeSignature ? await getPlainTextSignature(auth.userId) : "";
  const subject = fillMergeTags(parsed.data.subject, mergeCtx);
  const filledBody = appendSignature(fillMergeTags(parsed.data.body, mergeCtx), signature);

  let delivered = false;
  try {
    await sendTransactionalEmail({
      to: contact.email,
      toName: `${contact.firstName} ${contact.lastName}`,
      subject,
      text: filledBody,
      senderName: organization.name,
      replyTo: auth.email,
    });
    delivered = true;
  } catch {
    // Non-fatal — still recorded below so staff see it was attempted.
  }

  const message = await prisma.emailMessage.create({
    data: {
      organizationId: auth.organizationId,
      contactId: contact.id,
      fromAddress: auth.email,
      subject,
      snippet: filledBody.slice(0, 140),
      body: filledBody,
      receivedAt: new Date(),
      direction: "out",
    },
  });

  return NextResponse.json({ ...message, delivered }, { status: 201 });
}
