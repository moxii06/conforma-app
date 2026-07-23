import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { sendTransactionalEmail } from "@/lib/brevo";

// The learner's side of the signature workflow (mon-espace's "Mes
// documents" tab) — a stub click-to-sign, not a real e-signature capture.
// lib/yousign.ts has a real client ready to call once that integration is
// actually wired in (explicitly deferred by the client); this route is the
// status/notification half, built so swapping the stub for a real Yousign
// signature-request callback later only touches this one place.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== "LEARNER") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { dossier: { include: { contact: true } } },
  });
  if (!document || !document.dossier || document.dossier.learnerUserId !== session.userId) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }
  if (document.signatureStatus !== "pending") {
    return NextResponse.json({ error: "Ce document n'attend pas de signature." }, { status: 400 });
  }

  const signed = await prisma.document.update({
    where: { id: document.id },
    data: { signatureStatus: "signed", signedAt: new Date() },
  });

  if (document.sentByUserId) {
    const [sender, organization] = await Promise.all([
      prisma.user.findUnique({ where: { id: document.sentByUserId } }),
      prisma.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    ]);
    if (sender) {
      try {
        await sendTransactionalEmail({
          to: sender.email,
          toName: sender.name,
          subject: `Document signé — ${document.title}`,
          text: `${document.dossier.contact.firstName} ${document.dossier.contact.lastName} vient de signer « ${document.title} ».`,
          senderName: organization.name,
        });
      } catch {
        // Non-fatal — the signature itself is recorded either way.
      }
    }
  }

  return NextResponse.json(signed);
}
