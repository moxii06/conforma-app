import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { traiterDocumentSigne } from "@/lib/documentSending";

// Déclarer manuellement qu'un document a été signé (retour papier).
//
// Le pendant humain du webhook Yousign. Il appelle la MÊME fonction que les
// deux voies automatiques : « ce qui se passe quand un document est signé »
// n'existe qu'à un seul endroit (traiterDocumentSigne), sinon un contrat
// signé sur papier n'avancerait pas le Parcours de l'apprenant, ni ne
// matérialiserait son échéancier en factures, alors qu'un contrat signé en
// ligne le ferait — et personne ne comprendrait pourquoi. C'est exactement
// ce qui était arrivé à l'échéancier, du temps où les trois routes
// recopiaient la séquence.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "dossiers") === "none") {
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

  const signe = await prisma.document.update({
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

  const { echeancier } = await traiterDocumentSigne(signe);

  // C'est cette voie-ci qui a un écran en face, et c'est elle que
  // l'organisme habitué à saisir ses factures à la main va utiliser en
  // premier après le déploiement : elle rend l'issue de l'échéancier telle
  // quelle, avec l'avertissement rédigé quand la matérialisation a été
  // écartée. Le bouton peut l'afficher ; ne rien renvoyer le condamnerait à
  // dire « c'est fait » sans savoir ce qui a été fait.
  return NextResponse.json({ ok: true, echeancier });
}
