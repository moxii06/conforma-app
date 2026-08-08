import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";
import { buildFacturationPdf } from "@/lib/invoiceDocument";

// Relire un devis avant de l'envoyer, depuis la fiche prospect.
//
// Doublon apparent avec /api/facturation/quotes/[id]/pdf, mais la porte
// n'est pas la même et c'est tout l'intérêt : la Facturation est fermée au
// rôle Commercial (PERMISSIONS.invoicing = "none" pour SALES), alors que
// c'est précisément lui qui écrit aux prospects. Sans cette route, le
// bouton « Voir le devis » renverrait 403 à son utilisateur principal.
//
// Le contrôle est donc celui du CRM — accès à la fonction, PUIS accès à ce
// contact-là — et non celui de la facturation. Un commercial relit les
// devis de ses prospects ; il ne parcourt toujours pas la facturation.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const quote = await prisma.quote.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { id: true, contact: { select: { opportunities: { select: { ownerId: true } } } } },
  });
  if (!quote) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
  if (!canAccessContact(session.roles, session.userId, quote.contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const built = await buildFacturationPdf("quote", quote.id, session.organizationId);
  if (!built) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  // « inline » et non « attachment » : on veut le lire dans un onglet, pas
  // le télécharger pour l'ouvrir puis le supprimer.
  return new NextResponse(new Uint8Array(built.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${built.fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
    },
  });
}
