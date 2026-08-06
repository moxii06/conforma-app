import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { peutUtiliserMessagerie, ROLES_MESSAGERIE } from "@/lib/messagerie";

// À qui je peux écrire : l'équipe de mon organisme, moi excepté.
//
// Filtré sur les rôles qui ont la messagerie, et sur le statut : un compte
// « invited » n'a pas encore de mot de passe, lui écrire enverrait un message
// que personne ne lira. Un compte « disabled » a quitté l'organisme.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!peutUtiliserMessagerie(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const membres = await prisma.user.findMany({
    where: {
      organizationId: session.organizationId,
      id: { not: session.userId },
      role: { in: ROLES_MESSAGERIE },
      status: "active",
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ membres });
}
