/**
 * La recherche du sélecteur de destinataires, et son plafond.
 *
 * Vit ici plutôt que dans la route parce que le plafond est une donnée
 * partagée : la route décide combien de lignes elle rend, le dialogue décide
 * quoi écrire quand il y en a davantage. Les deux doivent parler du même
 * nombre — sans quoi l'écran annonce une troncature qui n'existe pas, ou
 * pire, n'en annonce aucune alors qu'elle a lieu.
 *
 * Module pur : aucun accès à Prisma, testable sans base.
 */

/**
 * Combien de contacts hors promotion la liste montre à la fois.
 *
 * Volontairement petit. Ce n'est pas une liste qu'on parcourt, c'est un
 * champ de recherche : au-delà d'une vingtaine de lignes, personne ne lit,
 * on tape. L'ancien code en rendait 200 SANS le dire — au-delà, 3 800
 * personnes sur 4 000 étaient introuvables, et l'écran ne le signalait pas.
 */
export const MAX_AUTRES_CONTACTS_AFFICHES = 20;

/** Le nombre minimal de caractères avant que la recherche filtre. */
export const LONGUEUR_MIN_RECHERCHE = 2;

type FiltreContact = {
  OR: { firstName?: object; lastName?: object; email?: object }[];
};

/**
 * La clause Prisma qui cherche un contact par prénom, nom ou email.
 *
 * Rend `null` quand la requête est trop courte : une recherche sur une
 * seule lettre ne filtre rien d'utile et coûte un balayage complet. Le
 * `null` se compose alors avec un spread, ce qui laisse la requête intacte.
 */
export function filtreRecherche(q: string): FiltreContact | null {
  const terme = q.trim();
  if (terme.length < LONGUEUR_MIN_RECHERCHE) return null;
  return {
    OR: [
      { firstName: { contains: terme, mode: "insensitive" } },
      { lastName: { contains: terme, mode: "insensitive" } },
      { email: { contains: terme, mode: "insensitive" } },
    ],
  };
}

/**
 * Ce qu'on écrit sous un groupe : combien on montre, combien il y en a.
 *
 * Rend `null` quand il n'y a rien à signaler — un « 8 sur 8 » permanent
 * finit par ne plus être lu, et emporte avec lui les fois où le nombre
 * compte vraiment.
 */
export function mentionTroncature(affiches: number, total: number, recherche: string): string | null {
  if (total <= affiches) return null;
  return recherche.trim().length >= LONGUEUR_MIN_RECHERCHE
    ? `${affiches} résultats sur ${total} — précisez votre recherche.`
    : `${affiches} affichés sur ${total} — cherchez par nom ou par email pour trouver les autres.`;
}
