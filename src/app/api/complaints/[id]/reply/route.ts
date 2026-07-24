import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";

const schema = z.object({ body: z.string().min(1) });

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

  const complaint = await prisma.complaint.findFirst({ where: { id: params.id, organizationId: session.organizationId } });
  if (!complaint) return NextResponse.json({ error: "Réclamation introuvable." }, { status: 404 });
  if (!complaint.submittedByEmail) {
    return NextResponse.json({ error: "Aucun email connu pour ce demandeur." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } });

  let delivered = false;
  let sendError: string | null = null;
  try {
    await sendTransactionalEmail({
      to: complaint.submittedByEmail,
      toName: complaint.submittedByName,
      subject: `Re: ${complaint.subject}`,
      text: parsed.data.body,
      senderName: organization.name,
      replyTo: session.email,
    });
    delivered = true;
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Erreur inattendue.";
  }

  return NextResponse.json({ delivered, sendError });
}
