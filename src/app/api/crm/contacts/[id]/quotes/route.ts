import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessContact } from "@/lib/tenant";

// Les devis d'un contact, pour le sélecteur de la fiche prospect.
//
// Chargés à l'ouverture de l'onglet « Devis » plutôt que passés en
// propriété serveur : la liste du CRM affiche des dizaines de prospects,
// et précharger les devis de chacun pour un onglet qu'on ouvrira une fois
// serait payer pour tout le monde ce dont un seul a besoin. Cela garantit
// aussi que le devis créé il y a dix secondes est là sans recharger la page.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Le devis est une donnée commerciale : qui n'a pas accès au CRM n'a pas
  // à lister ceux d'un contact.
  if (can(session.roles, "crm") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: { opportunities: { select: { ownerId: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  // Un commercial ne voit que ses propres prospects — même règle que
  // partout ailleurs, voir lib/tenant.ts.
  if (!canAccessContact(session.roles, session.userId, contact.opportunities)) {
    return NextResponse.json({ error: "Ce contact appartient à un autre commercial." }, { status: 403 });
  }

  const quotes = await prisma.quote.findMany({
    where: { organizationId: session.organizationId, contactId: contact.id },
    // description comprise : le composeur rouvre un devis existant dans son
    // éditeur, et un champ absent de la liste serait relu comme vide puis
    // réenregistré vide — la désignation disparaîtrait sans que rien ne le
    // dise. Une liste qui alimente un formulaire doit porter ce que le
    // formulaire écrit.
    select: {
      id: true,
      reference: true,
      amountCents: true,
      status: true,
      createdAt: true,
      description: true,
      lines: {
        select: { designation: true, quantity: true, unitPriceCents: true, unit: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    // Un prospect n'accumule pas des centaines de devis ; au-delà, ce sont
    // les plus récents qu'on renvoie.
    take: 20,
  });

  return NextResponse.json({ quotes });
}
