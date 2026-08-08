import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { effectiveRoles, getSessionContext } from "@/lib/tenant";
import { peutUtiliserMessagerie, compterNonLus, titreConversation, cleTeteATete } from "@/lib/messagerie";

// Mes conversations, et l'ouverture d'une nouvelle.
//
// L'appartenance décide de tout : on ne liste que les conversations dont je
// suis membre, jamais celles de mon organisme. Le rôle ouvre la porte de la
// messagerie ; il n'ouvre aucun fil auquel je n'ai pas été convié.

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Les rôles EFFECTIFS : entrer dans la messagerie est une pure question de
  // droit, pas de propriété — une seule casquette autorisée suffit. Un DPO
  // externe à qui on ajoute la casquette formateur entre par celle-là.
  if (!peutUtiliserMessagerie(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { organizationId: session.organizationId, membres: { some: { userId: session.userId } } },
    include: {
      membres: { include: { user: { select: { id: true, name: true } } } },
      // Le dernier message pour l'aperçu de la liste…
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { corps: true, authorId: true, createdAt: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  // …et, pour le compteur de non-lus, seulement ce qui est arrivé après MA
  // dernière lecture. On ne rapatrie pas l'historique complet : sur un fil de
  // mille messages, il ne servirait qu'à en compter trois.
  const mesLectures = new Map(
    conversations.map((c) => [c.id, c.membres.find((m) => m.userId === session.userId)?.lastReadAt ?? new Date(0)]),
  );
  const recents = await prisma.internalMessage.findMany({
    where: {
      conversationId: { in: conversations.map((c) => c.id) },
      authorId: { not: session.userId },
    },
    select: { conversationId: true, authorId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    // Borne de sûreté : au-delà, le badge affiche « 99+ » de toute façon.
    take: 500,
  });

  const resultat = conversations.map((c) => {
    const membres = c.membres.map((m) => ({ userId: m.userId, name: m.user.name }));
    const lu = mesLectures.get(c.id) ?? new Date(0);
    const nonLus = compterNonLus(
      recents.filter((m) => m.conversationId === c.id),
      session.userId,
      lu,
    );
    const dernier = c.messages[0];
    return {
      id: c.id,
      titre: titreConversation(c, membres, session.userId),
      estGroupe: c.estGroupe,
      membres,
      nonLus,
      lastMessageAt: c.lastMessageAt,
      apercu: dernier ? dernier.corps.slice(0, 120) : null,
      apercuDeMoi: dernier ? dernier.authorId === session.userId : false,
    };
  });

  return NextResponse.json({ conversations: resultat });
}

const schema = z.object({
  // Les destinataires. Un seul = tête-à-tête, plusieurs = groupe.
  membreIds: z.array(z.string().min(1)).min(1).max(30),
  titre: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  // Rôles effectifs, même raison que dans le GET ci-dessus.
  if (!peutUtiliserMessagerie(session.roles)) {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Destinataires invalides." }, { status: 400 });

  const autres = [...new Set(parsed.data.membreIds)].filter((id) => id !== session.userId);
  if (autres.length === 0) return NextResponse.json({ error: "Choisissez au moins un destinataire." }, { status: 400 });

  // Les destinataires doivent appartenir à MON organisme et avoir droit à la
  // messagerie. Sans cette vérification, un identifiant deviné ouvrirait un
  // fil avec quelqu'un d'une autre structure — le scoping par organisation ne
  // tient ici qu'à ce contrôle explicite.
  //
  // `additionalRoles` fait partie de la question, pas du décor : le
  // destinataire est jugé sur ses rôles EFFECTIFS, exactement comme
  // l'expéditeur l'est sur les siens deux lignes plus haut. Sans cela, un
  // collègue qui n'a la messagerie que par une casquette secondaire serait
  // proposé par le sélecteur puis refusé ici.
  const membresValides = await prisma.user.findMany({
    where: { id: { in: autres }, organizationId: session.organizationId },
    select: { id: true, role: true, additionalRoles: true },
  });
  const retenus = membresValides
    .filter((u) => peutUtiliserMessagerie(effectiveRoles(u.role, u.additionalRoles)))
    .map((u) => u.id);
  if (retenus.length !== autres.length) {
    return NextResponse.json({ error: "Un destinataire est introuvable ou n'a pas accès à la messagerie." }, { status: 400 });
  }

  const estGroupe = retenus.length > 1;

  // Un tête-à-tête ne se crée qu'une fois. Sans cette reprise, écrire deux
  // fois à la même personne depuis deux endroits ouvrirait deux fils
  // parallèles, et chacun croirait que l'autre ne répond pas.
  if (!estGroupe) {
    const cle = cleTeteATete(session.userId, retenus[0]);
    const candidats = await prisma.conversation.findMany({
      where: {
        organizationId: session.organizationId,
        estGroupe: false,
        membres: { some: { userId: session.userId } },
      },
      include: { membres: { select: { userId: true } } },
    });
    const existante = candidats.find(
      (c) => c.membres.length === 2 && cleTeteATete(c.membres[0].userId, c.membres[1].userId) === cle,
    );
    if (existante) return NextResponse.json({ id: existante.id, reprise: true }, { status: 200 });
  }

  const creee = await prisma.conversation.create({
    data: {
      organizationId: session.organizationId,
      estGroupe,
      titre: estGroupe ? parsed.data.titre?.trim() || null : null,
      createdById: session.userId,
      membres: { create: [session.userId, ...retenus].map((userId) => ({ userId })) },
    },
  });

  return NextResponse.json({ id: creee.id, reprise: false }, { status: 201 });
}
