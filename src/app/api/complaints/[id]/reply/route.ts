import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";
import { fillMergeTags } from "@/lib/mergeTags";
import { getPlainTextSignature, appendSignature } from "@/lib/emailSignature";

const schema = z.object({ body: z.string().min(1), includeSignature: z.boolean().optional() });

// Client feedback: staff need to reply to a complaint from right where they
// see it, not have to go dig up the submitter's email in their own mailbox
// first. Best-effort like the other outreach sends here — a failed send
// doesn't block anything, the complaint's own status/notes are unaffected.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const complaint = await prisma.complaint.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { dossier: { include: { contact: true, session: { include: { course: true } } } } },
  });
  if (!complaint) return NextResponse.json({ error: "Réclamation introuvable." }, { status: 404 });
  if (!complaint.submittedByEmail) {
    return NextResponse.json({ error: "Aucun email connu pour ce demandeur." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  // A complaint isn't always tied to a Dossier (e.g. a prospect's
  // question) — when it is, merge tags use the real Contact/Course; when
  // not, [Prénom]/[Nom] fall back to a naive split of the free-text
  // submittedByName (no Formation/Date de session to fill in that case).
  const [firstName, ...rest] = complaint.submittedByName.trim().split(/\s+/);
  const mergeCtx = complaint.dossier
    ? {
        firstName: complaint.dossier.contact.firstName,
        lastName: complaint.dossier.contact.lastName,
        courseTitle: complaint.dossier.session.course.title,
        sessionDateLabel:
          complaint.dossier.session.mode === "ROLLING"
            ? "formation en continu"
            : complaint.dossier.session.startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        organizationName: organization.name,
      }
    : { firstName: firstName ?? "", lastName: rest.join(" "), organizationName: organization.name };

  const signature = parsed.data.includeSignature ? await getPlainTextSignature(session.userId) : "";

  let delivered = false;
  let sendError: string | null = null;
  try {
    await sendTransactionalEmail({
      to: complaint.submittedByEmail,
      toName: complaint.submittedByName,
      subject: `Re: ${complaint.subject}`,
      text: appendSignature(fillMergeTags(parsed.data.body, mergeCtx), signature),
      senderName: organization.name,
      replyTo: session.email,
    });
    delivered = true;
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Erreur inattendue.";
  }

  return NextResponse.json({ delivered, sendError });
}
