import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { notifyDocumentSigned, syncParcoursFromSignedDocument, materialiseScheduleFromSignedDocument } from "@/lib/documentSending";

// Déclarer manuellement qu'un document a été signé (retour papier).
//
// Le pendant humain du webhook Yousign. Il appelle DÉLIBÉRÉMENT les mêmes
// trois helpers que la voie automatique : « ce qui se passe quand un
// document est signé » doit exister à un seul endroit, sinon un contrat
// signé sur papier n'avancerait pas le Parcours de l'apprenant, ni ne
// matérialiserait son échéancier en factures, alors qu'un contrat signé
// en ligne le ferait — et personne ne comprendrait pourquoi.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
  });
  if (!doc) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  // Idempotent : re-cliquer ne réécrit pas la date de signature. Une preuve
  // d'audit qui se décale à chaque clic ne vaut rien.
  if (doc.signatureStatus === "signed" || doc.signedAt) {
    return NextResponse.json({ ok: true, alreadySigned: true });
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      signatureStatus: "signed",
      signedAt: new Date(),
      // Tracé comme signature manuscrite : un auditeur ne pèse pas de la
      // même façon une signature électronique qualifiée et un scan papier,
      // donc on ne fait pas passer l'une pour l'autre.
      signatureProvider: "manual",
    },
  });

  await notifyDocumentSigned(doc, session.organizationId);
  await syncParcoursFromSignedDocument(doc);
  await materialiseScheduleFromSignedDocument(doc);

  return NextResponse.json({ ok: true });
}
