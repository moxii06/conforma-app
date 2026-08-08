import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { effectiveRoles, getSessionContext } from "@/lib/tenant";
import { peutUtiliserMessagerie, ROLES_MESSAGERIE } from "@/lib/messagerie";

// À qui je peux écrire : l'équipe de mon organisme, moi excepté.
//
// Filtré sur les rôles qui ont la messagerie, et sur le statut : un compte
// « invited » n'a pas encore de mot de passe, lui écrire enverrait un message
// que personne ne lira. Un compte « disabled » a quitté l'organisme.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Rôles effectifs : une seule casquette autorisée suffit à ouvrir la porte.
  if (!peutUtiliserMessagerie(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  // Le rôle cumulé compte ici autant que le principal, sinon un collègue qui
  // n'a la messagerie que par une casquette secondaire n'apparaîtrait jamais
  // dans ce sélecteur — alors que POST /api/messagerie/conversations, qui
  // juge sur les rôles effectifs, l'accepterait volontiers. Ce sélecteur et
  // cette route doivent répondre à la MÊME question, ou l'écran promet moins
  // que ce que l'application autorise.
  //
  // Le SQL dégrossit (`OR` sur les deux colonnes), `peutUtiliserMessagerie`
  // tranche : `effectiveRoles` écarte au passage les rôles non cumulables
  // qu'un seed ou du SQL à la main aurait pu glisser dans additionalRoles.
  const candidats = await prisma.user.findMany({
    where: {
      organizationId: session.organizationId,
      id: { not: session.userId },
      status: "active",
      OR: [{ role: { in: ROLES_MESSAGERIE } }, { additionalRoles: { hasSome: ROLES_MESSAGERIE } }],
    },
    select: { id: true, name: true, role: true, additionalRoles: true },
    orderBy: { name: "asc" },
  });

  // `role` seul dans la réponse, comme avant : l'écran affiche une étiquette
  // de rôle, pas la liste des casquettes — c'est /team qui montre le cumul.
  const membres = candidats
    .filter((u) => peutUtiliserMessagerie(effectiveRoles(u.role, u.additionalRoles)))
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return NextResponse.json({ membres });
}
