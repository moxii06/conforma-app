import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext } from "@/lib/tenant";
import { peutUtiliserMessagerie, LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";

// Le fil d'une conversation : le lire, et y écrire.
//
// Une seule porte pour les deux : être MEMBRE de cette conversation. Le rôle
// a déjà été vérifié pour entrer dans la messagerie, mais il ne dit rien de
// ce fil-ci — c'est l'appartenance qui décide.
async function membreDe(conversationId: string, userId: string, organizationId: string) {
  return prisma.conversationMember.findFirst({
    where: { conversationId, userId, conversation: { organizationId } },
  });
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!peutUtiliserMessagerie(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const membre = await membreDe(params.id, session.userId, session.organizationId);
  if (!membre) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });

  // `depuis` : le sondage ne redemande que la suite, pas tout le fil. Sans ce
  // paramètre, un onglet ouvert une journée rapatrierait mille messages
  // toutes les huit secondes.
  const url = new URL(request.url);
  const depuis = url.searchParams.get("depuis");
  const borne = depuis ? new Date(depuis) : null;
  const valide = borne && !Number.isNaN(borne.getTime()) ? borne : null;

  const messages = await prisma.internalMessage.findMany({
    where: { conversationId: params.id, ...(valide ? { createdAt: { gt: valide } } : {}) },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    // Sans borne, un fil ancien ouvert d'un coup ferait une réponse énorme.
    // Les 200 derniers suffisent à une conversation d'équipe ; la remontée
    // d'historique n'existe pas encore et l'écran ne prétend pas le contraire.
    take: 200,
  });

  // Ouvrir le fil, c'est le lire. On horodate la lecture ici plutôt que dans
  // une route dédiée : un appel de moins, et surtout impossible d'afficher
  // des messages sans les marquer lus.
  await prisma.conversationMember.update({
    where: { id: membre.id },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      corps: m.corps,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: m.author.name,
    })),
  });
}

const schema = z.object({ corps: z.string().min(1).max(LONGUEUR_MAX_MESSAGE) });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!peutUtiliserMessagerie(session.role)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const membre = await membreDe(params.id, session.userId, session.organizationId);
  if (!membre) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide ou trop long." }, { status: 400 });

  const corps = parsed.data.corps.trim();
  if (!corps) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  // Le message ET la date du dernier message dans la même transaction :
  // Conversation.lastMessageAt est dénormalisé pour trier la liste, et une
  // écriture qui réussirait sans l'autre laisserait un fil actif au fond.
  const [message] = await prisma.$transaction([
    prisma.internalMessage.create({
      data: { conversationId: params.id, authorId: session.userId, corps },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.conversation.update({ where: { id: params.id }, data: { lastMessageAt: new Date() } }),
    // Écrire, c'est avoir lu : sans cette ligne, mon propre envoi resterait
    // marqué non lu pour moi jusqu'à ce que je rouvre le fil.
    prisma.conversationMember.update({ where: { id: membre.id }, data: { lastReadAt: new Date() } }),
  ]);

  return NextResponse.json(
    {
      id: message.id,
      corps: message.corps,
      createdAt: message.createdAt,
      authorId: message.authorId,
      authorName: message.author.name,
    },
    { status: 201 },
  );
}
