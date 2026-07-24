import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { notifyDocumentSigned } from "@/lib/documentSending";

// The learner's side of the signature workflow (mon-espace's "Mes
// documents" tab) — a stub click-to-sign for organizations with no Yousign
// key configured. When a key IS configured, the send route routes the
// document through Yousign instead (yousignSignatureRequestId gets set),
// and it's the webhook at /api/webhooks/yousign/[organizationId] that
// flips signatureStatus to "signed", not this route — this one only
// handles documents that were never sent to Yousign in the first place.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.role !== "LEARNER") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { dossier: true },
  });
  if (!document || !document.dossier || document.dossier.learnerUserId !== session.userId) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }
  if (document.signatureStatus !== "pending") {
    return NextResponse.json({ error: "Ce document n'attend pas de signature." }, { status: 400 });
  }
  if (document.yousignSignatureRequestId) {
    return NextResponse.json({ error: "Ce document doit être signé via le lien envoyé par email, pas ici." }, { status: 400 });
  }

  const signed = await prisma.document.update({
    where: { id: document.id },
    data: { signatureStatus: "signed", signedAt: new Date() },
  });

  await notifyDocumentSigned(signed, session.organizationId);

  return NextResponse.json(signed);
}
