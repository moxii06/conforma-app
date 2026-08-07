import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";

// Les factures d'un contact, pour le composeur de la fiche prospect.
//
// Jumelle de la route « quotes » voisine, et pour la même raison qu'elle
// existe séparément de la Facturation : la porte est celle du CRM. Le rôle
// Commercial n'a pas accès à la Facturation (PERMISSIONS.invoicing = "none"),
// or c'est lui qui écrit au client. Sans cette route, l'onglet « Facture »
// renverrait 403 à son utilisateur principal.
//
// Chargée à l'ouverture de l'onglet, pas préchargée : la liste du CRM affiche
// des dizaines de prospects, et payer pour tous ce dont un seul a besoin est
// exactement ce qui a fait tomber cet écran à 22 Mo par affichage ailleurs.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(session.role, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { opportunities: { select: { ownerId: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  if (!canAccessContact(session.role, session.userId, contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: session.organizationId, contactId: contact.id },
    // description, dueDate et fundingOrigin comprises : le composeur rouvre
    // une facture existante dans son éditeur, et un champ absent d'ici serait
    // relu comme vide puis réenregistré vide — c'est exactement ce qui
    // laissait l'origine du financement à "Non renseigné" en permanence.
    select: {
      id: true,
      reference: true,
      amountCents: true,
      status: true,
      createdAt: true,
      description: true,
      dueDate: true,
      fundingOrigin: true,
      lines: {
        select: { designation: true, quantity: true, unitPriceCents: true, unit: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ invoices });
}
