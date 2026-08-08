import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";
import { buildFacturationPdf } from "@/lib/invoiceDocument";

// Relire une facture avant de l'envoyer, depuis la fiche prospect.
//
// Même construction que /api/crm/quotes/[id]/pdf, et le doublon apparent avec
// /api/facturation/invoices/[id]/pdf a la même justification : la Facturation
// est fermée au rôle Commercial, qui est pourtant celui qui écrit au client.
// Le contrôle est donc celui du CRM — accès à la fonction, PUIS accès à ce
// contact-là. Un commercial relit les factures de ses clients ; il ne parcourt
// toujours pas la facturation.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.roles, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    select: { id: true, contact: { select: { opportunities: { select: { ownerId: true } } } } },
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  if (!canAccessContact(session.roles, session.userId, invoice.contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const built = await buildFacturationPdf("invoice", invoice.id, session.organizationId);
  if (!built) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  // « inline » et non « attachment » : on veut la lire dans un onglet avant
  // de l'envoyer, pas la télécharger pour l'ouvrir puis la supprimer.
  return new NextResponse(new Uint8Array(built.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${built.fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
    },
  });
}
