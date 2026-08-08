import { prisma } from "@/lib/prisma";

/**
 * Messagerie éditeur ↔ organisme — la mécanique commune aux deux bouts.
 *
 * Deux routes servent ce canal, et elles ne peuvent pas être fusionnées :
 * l'une s'authentifie par le cookie du back-office plateforme (l'éditeur n'est
 * un User d'aucun organisme), l'autre par la session NextAuth de l'admin de
 * l'OF. Mais une fois la porte franchie, elles font exactement la même chose —
 * même fil, mêmes messages, même marquage de lecture. Ce fichier est cette
 * partie-là, pour qu'elle ne soit pas écrite deux fois et ne dérive pas.
 *
 * À ne pas confondre avec PlatformEmailMessage : là-bas un e-mail part
 * réellement par Brevo, ici rien ne sort de Jalon.
 */

export type EmetteurPlateforme = "platform" | "organization";

/**
 * Le nom affiché de l'éditeur dans les bulles.
 *
 * Constante plutôt que saisie : le back-office plateforme n'a pas de comptes
 * nominatifs — un secret partagé, un opérateur (voir platformAdmin.ts). Faire
 * signer « Gu » un message que n'importe quel détenteur du secret peut écrire
 * serait une attribution fausse.
 */
export const NOM_EDITEUR = "Jalon";

export type MessagePlateforme = {
  id: string;
  corps: string;
  emetteur: string;
  auteurNom: string;
  createdAt: Date;
};

/**
 * Lire le fil d'un organisme, du point de vue de `moi`.
 *
 * `depuis` sert au sondage : ne redemander que la suite. Sans lui, un onglet
 * laissé ouvert rapatrierait l'historique complet toutes les huit secondes.
 *
 * Lire, c'est marquer lu — mais seulement les messages de l'AUTRE camp.
 * `luParDestAt` veut dire « vu par le destinataire » ; l'appliquer à ses
 * propres messages le viderait de son sens et l'accusé de lecture ne
 * signifierait plus rien pour personne.
 */
export async function lireFilPlateforme(
  organizationId: string,
  moi: EmetteurPlateforme,
  depuis: string | null,
): Promise<{ messages: MessagePlateforme[] }> {
  const thread = await prisma.platformThread.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (!thread) return { messages: [] };

  const borne = depuis ? new Date(depuis) : null;
  const valide = borne && !Number.isNaN(borne.getTime()) ? borne : null;

  const messages = await prisma.platformMessage.findMany({
    where: { threadId: thread.id, ...(valide ? { createdAt: { gt: valide } } : {}) },
    orderBy: { createdAt: "asc" },
    // Même borne que les autres messageries : un canal éditeur ↔ client se
    // compte en dizaines de messages, et la remontée d'historique n'existe pas
    // encore à l'écran — qui ne prétend pas le contraire.
    take: 200,
    select: { id: true, corps: true, emetteur: true, auteurNom: true, createdAt: true },
  });

  await prisma.platformMessage.updateMany({
    where: { threadId: thread.id, luParDestAt: null, emetteur: { not: moi } },
    data: { luParDestAt: new Date() },
  });

  return { messages };
}

/**
 * Écrire dans le fil d'un organisme, en le créant s'il n'existe pas encore.
 *
 * `organizationId` est unique sur PlatformThread : l'upsert absorbe deux
 * envois simultanés sans jamais créer deux fils parallèles — cas très réel
 * ici, où l'éditeur et l'admin peuvent ouvrir la conversation en même temps
 * depuis deux écrans qui ne se connaissent pas.
 */
export async function ecrireFilPlateforme(
  organizationId: string,
  emetteur: EmetteurPlateforme,
  auteurNom: string,
  corps: string,
): Promise<MessagePlateforme> {
  const thread = await prisma.platformThread.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
    select: { id: true },
  });

  // lastMessageAt est dénormalisé pour classer les organismes par activité
  // côté back-office : une écriture qui réussirait sans l'autre laisserait un
  // échange en cours au fond de la liste.
  const [message] = await prisma.$transaction([
    prisma.platformMessage.create({
      data: { threadId: thread.id, emetteur, auteurNom, corps },
      select: { id: true, corps: true, emetteur: true, auteurNom: true, createdAt: true },
    }),
    prisma.platformThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
  ]);

  return message;
}
