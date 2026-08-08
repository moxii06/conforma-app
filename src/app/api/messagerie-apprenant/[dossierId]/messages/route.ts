import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionContext, type SessionContext } from "@/lib/tenant";
import { LONGUEUR_MAX_MESSAGE } from "@/lib/messagerie";
import { calculerFermeture, campDe, estFerme, peutSuivreFilApprenant } from "@/lib/messagerieApprenant";
import { Role } from "@prisma/client";

// Le fil d'un dossier : le lire, et y écrire.
//
// Une seule route pour les deux camps, volontairement. La règle d'accès n'est
// pas la même de chaque côté (l'apprenant doit être LE titulaire du dossier,
// l'organisme doit être administratif ou formateur de la session), mais tout
// le reste l'est — même fil, mêmes messages, même fermeture. En faire deux
// routes aurait dupliqué la lecture, le marquage de lecture et le calcul de
// closesAt, avec la garantie qu'elles finiraient par diverger.

type Acces = {
  dossierId: string;
  organizationId: string;
  learnerUserId: string | null;
  cote: "apprenant" | "organisme";
  threadId: string | null;
  /**
   * La date de fermeture, RECALCULÉE à chaque appel plutôt que lue dans le
   * fil. C'est elle qui fait autorité partout — affichage comme refus
   * d'écriture — et la colonne LearnerThread.closesAt n'en est que la copie,
   * rafraîchie au moment d'écrire (voir POST).
   *
   * Pourquoi ce sens et pas l'inverse : une session dont les dates reculent
   * doit rouvrir le fil, et un apprenant en continu qui commence trois mois
   * après son inscription doit voir son échéance suivre. Si la valeur figée
   * en base faisait foi, l'écran annoncerait « clos » là où la route
   * accepterait encore d'écrire, ou l'inverse.
   */
  fermeture: Date | null;
};

/**
 * Qui demande, sur quel dossier, et a-t-il le droit.
 *
 * Le dossier est TOUJOURS relu depuis la base avec le filtre organizationId :
 * l'identifiant vient de l'URL, donc du client, et il ne prouve rien. Un
 * dossier hors périmètre est rendu introuvable plutôt qu'interdit — un 403
 * confirmerait qu'il existe.
 */
async function resoudreAcces(dossierId: string, ctx: SessionContext): Promise<Acces | null> {
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, organizationId: ctx.organizationId },
    select: {
      id: true,
      organizationId: true,
      learnerUserId: true,
      createdAt: true,
      accessDurationDays: true,
      firstAccessedAt: true,
      session: { select: { mode: true, endsAt: true, trainerId: true } },
      learnerThread: { select: { id: true } },
    },
  });
  if (!dossier) return null;

  let cote: "apprenant" | "organisme";
  if (ctx.role === Role.LEARNER) {
    // Le titulaire du dossier, et lui seul. Un apprenant qui devine
    // l'identifiant du dossier d'un camarade ne doit rien obtenir.
    if (dossier.learnerUserId !== ctx.userId) return null;
    cote = "apprenant";
  } else {
    // Les rôles EFFECTIFS : la fonction tranche casquette par casquette, donc
    // la condition « CETTE session-là » reste attachée à la seule casquette
    // formateur — un formateur-commercial n'y gagne aucun fil de plus.
    if (!peutSuivreFilApprenant(ctx.roles, ctx.userId, dossier.session)) return null;
    cote = "organisme";
  }

  return {
    dossierId: dossier.id,
    organizationId: dossier.organizationId,
    learnerUserId: dossier.learnerUserId,
    cote,
    threadId: dossier.learnerThread?.id ?? null,
    fermeture: calculerFermeture(dossier.session, dossier),
  };
}

export async function GET(request: Request, props: { params: Promise<{ dossierId: string }> }) {
  const params = await props.params;
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const acces = await resoudreAcces(params.dossierId, ctx);
  if (!acces) return NextResponse.json({ error: "Fil introuvable." }, { status: 404 });

  // Tant que personne n'a écrit, le fil n'existe pas en base — mais son
  // échéance, si. On la renvoie quand même : l'apprenant doit voir jusqu'à
  // quand il peut poser une question AVANT de se décider à en poser une.
  const ferme = estFerme(acces.fermeture);

  // Fermé : l'apprenant ne voit plus rien, l'organisme garde l'historique.
  // L'asymétrie est voulue — l'organisme a une obligation de traçabilité sur
  // ce qui s'est dit pendant la formation, l'apprenant n'a plus de motif
  // d'accès une fois son inscription close et ses accès retirés.
  if (ferme && acces.cote === "apprenant") {
    return NextResponse.json({ ferme: true, closesAt: acces.fermeture, messages: [] });
  }

  if (!acces.threadId) return NextResponse.json({ ferme, closesAt: acces.fermeture, messages: [] });

  // `depuis` : le sondage ne redemande que la suite, jamais tout le fil. Même
  // mécanique que la messagerie interne — sans ça, un onglet laissé ouvert
  // rapatrierait l'historique complet toutes les huit secondes.
  const url = new URL(request.url);
  const depuis = url.searchParams.get("depuis");
  const borne = depuis ? new Date(depuis) : null;
  const valide = borne && !Number.isNaN(borne.getTime()) ? borne : null;

  const messages = await prisma.learnerMessage.findMany({
    where: { threadId: acces.threadId, ...(valide ? { createdAt: { gt: valide } } : {}) },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    // Même borne que la messagerie interne : un fil d'accompagnement se compte
    // en dizaines de messages, pas en milliers, et la remontée d'historique
    // n'existe pas encore côté écran.
    take: 200,
  });

  // Ouvrir le fil, c'est le lire. Marqué ici plutôt que dans une route dédiée :
  // un appel de moins, et surtout impossible d'afficher des messages sans les
  // marquer lus. Seuls ceux du camp d'en face sont marqués — `luAt` veut dire
  // « vu par l'autre partie », pas « vu par untel » (voir le commentaire du
  // champ dans le schéma), et marquer les siens le viderait de son sens.
  if (acces.learnerUserId) {
    const campOppose =
      acces.cote === "apprenant" ? { authorId: { not: acces.learnerUserId } } : { authorId: acces.learnerUserId };
    await prisma.learnerMessage.updateMany({
      where: { threadId: acces.threadId, luAt: null, ...campOppose },
      data: { luAt: new Date() },
    });
  }

  return NextResponse.json({
    ferme,
    closesAt: acces.fermeture,
    messages: messages.map((m) => ({
      id: m.id,
      corps: m.corps,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: m.author.name,
      deLApprenant: campDe(m.authorId, acces.learnerUserId) === "apprenant",
    })),
  });
}

const schema = z.object({ corps: z.string().min(1).max(LONGUEUR_MAX_MESSAGE) });

export async function POST(request: Request, props: { params: Promise<{ dossierId: string }> }) {
  const params = await props.params;
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const acces = await resoudreAcces(params.dossierId, ctx);
  if (!acces) return NextResponse.json({ error: "Fil introuvable." }, { status: 404 });

  // Un fil sans compte apprenant ne peut pas exister : l'auteur d'un message
  // est toujours un User, et « qui est l'apprenant » est ce qui départage les
  // deux camps. Ouvrir le fil avant que l'apprenant ait ses accès rendrait
  // tout message ultérieur inclassable.
  if (!acces.learnerUserId) {
    return NextResponse.json(
      { error: "L'apprenant n'a pas encore accès à son espace — envoyez-lui ses accès pour ouvrir le fil." },
      { status: 409 },
    );
  }

  if (estFerme(acces.fermeture)) {
    return NextResponse.json(
      { error: "Ce fil est clos : la formation est terminée depuis plus d'un mois." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Message vide ou trop long." }, { status: 400 });
  const corps = parsed.data.corps.trim();
  if (!corps) return NextResponse.json({ error: "Message vide." }, { status: 400 });

  // Créé à la demande, au premier message : `dossierId` est unique, donc
  // l'upsert absorbe deux envois simultanés sans jamais créer deux fils.
  //
  // C'est aussi le seul moment où l'échéance est écrite : en lecture, un
  // sondage toutes les huit secondes n'a aucune raison d'écrire en base.
  const thread = await prisma.learnerThread.upsert({
    where: { dossierId: acces.dossierId },
    create: {
      organizationId: acces.organizationId,
      dossierId: acces.dossierId,
      closesAt: acces.fermeture,
    },
    update: { closesAt: acces.fermeture },
    select: { id: true },
  });

  const [message] = await prisma.$transaction([
    prisma.learnerMessage.create({
      data: { threadId: thread.id, authorId: ctx.userId, corps },
      include: { author: { select: { id: true, name: true } } },
    }),
    // lastMessageAt est dénormalisé pour trier la liste des fils côté
    // apprenant : une écriture qui réussirait sans l'autre laisserait un fil
    // actif au fond de sa liste.
    prisma.learnerThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
  ]);

  return NextResponse.json(
    {
      id: message.id,
      corps: message.corps,
      createdAt: message.createdAt,
      authorId: message.authorId,
      authorName: message.author.name,
      deLApprenant: campDe(message.authorId, acces.learnerUserId) === "apprenant",
      closesAt: acces.fermeture,
    },
    { status: 201 },
  );
}
