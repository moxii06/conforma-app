import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { peutUtiliserMessagerie } from "@/lib/messagerie";

// Le seul chiffre dont la barre latérale a besoin.
//
// Route séparée de /api/messagerie/conversations, qui renvoie les fils, leurs
// membres et leurs aperçus : la pastille n'a que faire de tout cela, et elle
// est interrogée depuis TOUTES les pages de l'application. Lui faire porter
// la liste complète aurait fait payer à chaque écran le prix d'un écran qu'on
// n'a pas ouvert.
export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Pas d'erreur pour un rôle sans messagerie : la barre latérale ne montre
  // même pas l'entrée, un 403 dans la console de tous ses écrans serait du
  // bruit. Zéro non-lu est la réponse juste.
  if (!peutUtiliserMessagerie(session.role)) return NextResponse.json({ total: 0 });

  const appartenances = await prisma.conversationMember.findMany({
    where: { userId: session.userId, conversation: { organizationId: session.organizationId } },
    select: { conversationId: true, lastReadAt: true },
  });
  if (appartenances.length === 0) return NextResponse.json({ total: 0 });

  // Un seul count, avec un OR par conversation : le seuil de lecture n'est
  // pas le même d'un fil à l'autre, et SQL ne sait pas l'exprimer autrement
  // sans jointure sur mesure. Une équipe a quelques dizaines de fils, pas
  // quelques milliers.
  const total = await prisma.internalMessage.count({
    where: {
      authorId: { not: session.userId },
      OR: appartenances.map((a) => ({ conversationId: a.conversationId, createdAt: { gt: a.lastReadAt } })),
    },
  });

  return NextResponse.json({ total });
}
