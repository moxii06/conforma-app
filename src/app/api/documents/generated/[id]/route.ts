import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { INCLUDE_ACCES_DOCUMENT, peutLireDocument } from "@/lib/documentAccess";
import { chargerMiseEnPage } from "@/lib/documentSending";
import { generatePdfFromRichText } from "@/lib/htmlToPdf";
import { ensureHtml } from "@/lib/plainTextToHtml";

// Le document rédigé dans l'application, servi en PDF.
//
// Deux défauts corrigés ici, qui n'en faisaient qu'un du point de vue de qui
// cliquait :
//
//   — la route rendait `bodyText` en `text/plain`. Depuis que les documents
//     sont du HTML, le lecteur recevait le CODE SOURCE : une page de balises
//     <p> au lieu de son attestation. Et cette URL part par email (« votre
//     attestation est disponible ici »), donc chez l'apprenant.
//   — l'accès ne vérifiait que l'organisation, jamais le rattachement. Un
//     apprenant pouvait donc lire le contrat d'un autre apprenant du même
//     organisme. La règle vit désormais dans lib/documentAccess.ts, partagée
//     avec /api/documents/[id]/file : deux règles pour le même document, la
//     plus permissive gagne toujours, et c'est celle-là qu'on découvre trop
//     tard.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: INCLUDE_ACCES_DOCUMENT,
  });
  if (!document || !document.bodyText) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  if (!peutLireDocument(document, { role: session.role, userId: session.userId })) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  // Le même habillage que la pièce jointe envoyée : en-tête, logo, titre
  // encadré, pied de page avec les mentions légales et la pagination. Sans
  // cela, le document consulté par le lien ne ressemblerait pas à celui reçu
  // en pièce jointe — et c'est le même document.
  const miseEnPage = await chargerMiseEnPage(session.organizationId);
  const pdf = await generatePdfFromRichText(document.title, ensureHtml(document.bodyText), miseEnPage);

  // Content-Disposition's `filename` param is a ByteString (Latin-1 only) —
  // a title with an em-dash or other character outside that range (common
  // here, e.g. "Attestation — Nom") throws when building the header rather
  // than just mangling it. `filename*` (RFC 6266) carries the real UTF-8
  // name; the ASCII `filename` fallback strips anything Latin-1 can't hold.
  const asciiFallback = document.title.replace(/[^\x20-\x7E]/g, "_");
  const utf8Name = encodeURIComponent(`${document.title}.pdf`);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` : le navigateur l'affiche plutôt que de le télécharger. Un
      // apprenant qui clique sur le lien de son attestation veut la LIRE.
      "Content-Disposition": `inline; filename="${asciiFallback}.pdf"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
