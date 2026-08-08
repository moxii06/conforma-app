import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can } from "@/lib/tenant";
import { DOSSIERS_ACTIFS } from "@/lib/dossierArchive";
import { Role, type Prisma } from "@prisma/client";

// Le pendant de /api/contacts/search pour les dossiers de formation.
//
// Raison d'être (audit S7, P1 n°6) : les écrans qui offraient de choisir un
// dossier chargeaient les 8 000 dossiers de l'organisme pour les verser dans
// une liste déroulante. Illisible, et surtout 22 Mo envoyés au navigateur à
// chaque ouverture de la page Facturation. Un sélecteur n'a jamais besoin de
// la base entière : il a besoin des dix lignes qui correspondent à ce qu'on
// tape.
//
// Deux façons d'interroger, selon ce que l'écran sait déjà :
//   ?contactId=…  les dossiers de CETTE personne (facture, devis : le
//                 dossier lié appartient forcément au client facturé) ;
//   ?q=…          recherche libre sur le nom de l'apprenant ou le titre de
//                 la formation, quand aucun contact n'est encore choisi.
const LIMITE = 10;

export async function GET(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "dossiers") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const contactId = params.get("contactId")?.trim() || undefined;
  // Ni contact ni recherche : rien à proposer. On ne retombe pas sur « les
  // dix premiers dossiers de l'organisme », qui n'ont aucune raison d'être
  // les bons et donnent l'illusion d'une liste.
  if (!contactId && q.length < 2) return NextResponse.json([]);

  // Même règle que la liste des dossiers : un formateur ne voit que les
  // apprenants de ses propres sessions.
  const ownerFilter: Prisma.DossierWhereInput =
    auth.role === Role.TRAINER ? { session: { trainerId: auth.userId } } : {};

  const dossiers = await prisma.dossier.findMany({
    where: {
      organizationId: auth.organizationId,
      ...ownerFilter,
      // Un dossier clos ne s'offre pas pour une action nouvelle — c'est la
      // doctrine écrite dans lib/dossierArchive.ts. Il reste consultable
      // partout ailleurs.
      ...DOSSIERS_ACTIFS,
      ...(contactId ? { contactId } : {}),
      ...(q
        ? {
            OR: [
              { contact: { firstName: { contains: q, mode: "insensitive" } } },
              { contact: { lastName: { contains: q, mode: "insensitive" } } },
              { session: { course: { title: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      contact: { select: { firstName: true, lastName: true } },
      session: { select: { course: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMITE,
  });

  // Le libellé est construit ici, une fois : les trois écrans qui
  // l'affichaient le composaient chacun de leur côté, et rien ne garantissait
  // qu'ils restent d'accord.
  return NextResponse.json(
    dossiers.map((d) => ({
      id: d.id,
      label: `${d.contact.firstName} ${d.contact.lastName} — ${d.session.course.title}`,
    }))
  );
}
