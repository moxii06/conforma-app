/**
 * Qui sert-on à ce passage ? — la décision au cœur de l'envoi groupé de
 * documents (audit S7, P1 n°7).
 *
 * Elle est isolée ici parce qu'elle porte à elle seule les deux propriétés
 * qu'on est venu réparer, et qu'aucune des deux ne doit dépendre d'un
 * fournisseur d'emails, d'un stockage de fichiers ou d'une base pour être
 * vérifiée :
 *
 *  1. **Un passage tient dans son budget.** L'envoi était une boucle
 *     séquentielle sans plafond ; la plateforme la coupait vers la
 *     quarantaine de destinataires, sans que rien ne le dise. Un plafond
 *     explicite remplace une coupure silencieuse par un reste annoncé.
 *
 *  2. **Rejouer converge au lieu de dupliquer.** Rien ne gardait trace de
 *     qui avait été servi : relancer après une coupure renvoyait le
 *     document à tout le monde, y compris à ceux qui l'avaient déjà reçu.
 *     Un document parti ne se rattrape pas.
 */

/**
 * Plafond par passage. Avec CONCURRENCE_ENVOI, soixante envois tiennent
 * très largement dans les 60 s allouées à la route — la marge est
 * volontairement large, parce que dépasser signifie ici perdre le compte de
 * ce qui est parti.
 */
export const MAX_DESTINATAIRES_PAR_PASSAGE = 60;

/** Ni en série (interminable), ni tout d'un coup (le fournisseur suit). */
export const CONCURRENCE_ENVOI = 4;

export type RepartitionEnvoi<T> = {
  /** À servir maintenant, dans l'ordre. */
  aServir: T[];
  /** Non tentés faute de place — ils partiront au passage suivant. */
  reste: number;
  /** Déjà servis par un passage antérieur du MÊME lot : jamais renvoyés. */
  dejaServis: number;
};

export function repartirEnvoi<T extends { id: string }>({
  demandes,
  dejaServis,
  max = MAX_DESTINATAIRES_PAR_PASSAGE,
}: {
  /** Tous les destinataires cochés par l'utilisateur, ordre stable. */
  demandes: T[];
  /** Identifiants déjà servis dans ce lot (lus en base sur batchId). */
  dejaServis: Set<string>;
  max?: number;
}): RepartitionEnvoi<T> {
  const restants = demandes.filter((d) => !dejaServis.has(d.id));
  // Le tranchage préserve l'ordre d'origine : c'est ce qui garantit qu'un
  // passage reprend là où le précédent s'est arrêté, et que personne ne
  // passe deux fois par simple réordonnancement.
  const aServir = restants.slice(0, Math.max(0, max));
  return {
    aServir,
    reste: restants.length - aServir.length,
    dejaServis: demandes.length - restants.length,
  };
}
