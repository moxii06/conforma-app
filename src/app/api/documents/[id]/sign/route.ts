import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { traiterDocumentSigne } from "@/lib/documentSending";

// The learner's side of the signature workflow (mon-espace's "Mes
// documents" tab) — a stub click-to-sign for organizations with no Yousign
// key configured. When a key IS configured, the send route routes the
// document through Yousign instead (yousignSignatureRequestId gets set),
// and it's the webhook at /api/webhooks/yousign/[organizationId] that
// flips signatureStatus to "signed", not this route — this one only
// handles documents that were never sent to Yousign in the first place.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // Même séquence que les deux autres voies de signature, au même endroit —
  // voir traiterDocumentSigne dans lib/documentSending.ts.
  await traiterDocumentSigne(signed);

  // La réponse ne porte volontairement PAS l'issue de l'échéancier : celui
  // qui la reçoit est l'apprenant, et l'état de facturation de l'organisme
  // ne le regarde pas. L'avertissement éventuel lui parvient par le seul
  // canal légitime — le mail « Document signé » adressé à l'organisme.
  return NextResponse.json(signed);
}
