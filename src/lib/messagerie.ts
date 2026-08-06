import { Role } from "@prisma/client";

// La messagerie interne — ce que le schéma ne dit pas.
//
// Trois règles y vivent, parce que trois écrans (la liste, le fil, la pastille
// de la barre latérale) doivent répondre pareil. Elles sont pures et testées :
// c'est le seul endroit où « qui peut parler à qui » et « qu'est-ce qui est
// non lu » sont décidés.

/**
 * Qui a droit à la messagerie interne.
 *
 * L'équipe de l'organisme, et elle seule. Deux exclusions qui comptent :
 *
 * - LEARNER : un apprenant n'est pas un collègue. Lui ouvrir la messagerie
 *   lui donnerait la liste nominative de tout le personnel et un canal direct
 *   vers chacun, là où son point de contact est son formateur, via son espace.
 * - DPO_EXTERNAL : c'est un prestataire extérieur, dont l'accès est
 *   volontairement borné au registre RGPD (voir PERMISSIONS.rgpd).
 *
 * Le rôle TRAINER est inclus, et c'est délibéré malgré un piège : un
 * sous-traitant invité se connecte AVEC ce rôle (voir
 * /api/subcontractors/[id]/invite). Il verra donc l'équipe et pourra lui
 * écrire — ce qui est le but, un intervenant a besoin de joindre le
 * responsable pédagogique. Ce qu'il ne verra pas, ce sont les conversations
 * auxquelles il n'appartient pas : l'appartenance, pas le rôle, décide de ce
 * qu'on lit.
 */
export const ROLES_MESSAGERIE: Role[] = [Role.ADMIN_OF, Role.ADMIN_MANAGER, Role.SALES, Role.TRAINER];

export function peutUtiliserMessagerie(role: Role): boolean {
  return ROLES_MESSAGERIE.includes(role);
}

export type MembreConversation = {
  userId: string;
  name: string;
  lastReadAt: string | Date;
};

export type MessageResume = {
  authorId: string;
  createdAt: string | Date;
};

/**
 * Combien de messages cette personne n'a pas lus dans cette conversation.
 *
 * « Non lu » = posté après ma dernière lecture, ET par quelqu'un d'autre. La
 * seconde condition n'est pas cosmétique : sans elle, envoyer un message
 * incrémenterait mon propre compteur de non-lus jusqu'à ce que je rouvre le
 * fil que je viens moi-même d'écrire.
 */
export function compterNonLus(messages: MessageResume[], moi: string, lastReadAt: string | Date): number {
  const seuil = new Date(lastReadAt).getTime();
  return messages.filter((m) => m.authorId !== moi && new Date(m.createdAt).getTime() > seuil).length;
}

/**
 * Le nom d'une conversation, tel que le voit UNE personne donnée.
 *
 * Un tête-à-tête s'appelle du nom de l'autre — donc pas le même nom selon qui
 * regarde, d'où l'absence de titre stocké en base pour ce cas. Un groupe porte
 * son titre ; à défaut, la liste de ses membres, moi excepté : « Moi, Claire,
 * Thomas » se lit moins bien que « Claire, Thomas ».
 */
export function titreConversation(
  conversation: { titre: string | null; estGroupe: boolean },
  membres: { userId: string; name: string }[],
  moi: string,
): string {
  if (conversation.titre?.trim()) return conversation.titre.trim();
  const autres = membres.filter((m) => m.userId !== moi).map((m) => m.name);
  if (autres.length === 0) return "Moi";
  if (!conversation.estGroupe) return autres[0];
  if (autres.length <= 3) return autres.join(", ");
  return `${autres.slice(0, 3).join(", ")} +${autres.length - 3}`;
}

/**
 * L'identité d'un tête-à-tête, pour ne pas en ouvrir deux entre les mêmes
 * personnes. Les identifiants sont triés : la paire (A,B) et la paire (B,A)
 * doivent produire la même clé, sinon deux fils parallèles s'installent et
 * chacun croit que l'autre ne répond pas.
 */
export function cleTeteATete(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Limite de saisie — un message d'équipe, pas un rapport. */
export const LONGUEUR_MAX_MESSAGE = 4000;

/**
 * Intervalle de rafraîchissement, en millisecondes.
 *
 * Vercel n'héberge pas de connexion persistante : pas de websocket, donc on
 * interroge. 8 secondes est le compromis retenu — assez court pour qu'une
 * conversation reste vivante, assez long pour qu'une équipe de dix personnes
 * laissant l'onglet ouvert toute la journée ne représente qu'un trafic
 * négligeable. Le sondage s'arrête quand l'onglet passe en arrière-plan.
 */
export const INTERVALLE_SONDAGE_MS = 8000;
