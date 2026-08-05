/**
 * Quels modèles proposer, et dans quel ordre, selon la formation en jeu.
 *
 * Retour client : « quand je clique sur Modèles dans une formation, il
 * faudrait que l'OFP puisse créer sa propre base de modèles pour cette
 * formation, et qu'elle lui soit proposée quand il envoie un document pour
 * cette formation ».
 *
 * La première moitié existait déjà (DocumentTemplate.courseId), la seconde
 * pas du tout : AUCUN des écrans d'envoi ne lisait courseId. Un modèle
 * « Convention — Anglais professionnel » apparaissait donc dans tous les
 * dossiers, y compris ceux d'une autre formation, sans rien pour le
 * distinguer d'un modèle général. Ce n'était pas une fonctionnalité
 * manquante mais un piège : envoyer la convention d'une autre formation
 * est une erreur qu'on ne rattrape pas une fois l'email parti.
 *
 * LA RÈGLE, EN UNE PHRASE : un modèle rattaché à une formation n'est
 * proposé que là où c'est CETTE formation qui est en jeu, et nulle part
 * ailleurs.
 *
 * Masquer plutôt que rétrograder est délibéré. Sur un écran qui liste
 * quelques dizaines de modèles, un modèle inapplicable rangé en bas de
 * liste reste cliquable — et il sera cliqué. Un document faux coûte plus
 * cher qu'une option absente.
 */

export type ScopedTemplate = {
  id: string;
  title: string;
  category: string;
  /** null = modèle général (bibliothèque Jalon ou modèle maison de l'organisme). */
  courseId?: string | null;
};

/**
 * Filtre côté base : à passer dans le `where` d'une requête de modèles.
 *
 * `courseId` est celui de la formation en jeu — celle du dossier, de la
 * session… — ou null/undefined quand l'écran n'en a aucune (fiche prospect,
 * sous-traitant). Sans formation, seuls les modèles généraux sont proposés :
 * on ne devine pas la formation d'un prospect.
 */
export function templateCourseFilter(courseId: string | null | undefined) {
  return courseId ? { OR: [{ courseId: null }, { courseId }] } : { courseId: null };
}

/**
 * Tri en mémoire : les modèles de la formation d'abord.
 *
 * Le filtre ci-dessus décide de ce qui est PROPOSÉ, celui-ci de ce qui est
 * VU en premier. Les deux vont ensemble : une liste correcte où le modèle
 * qu'on cherche est en vingtième position n'est correcte que sur le papier.
 */
export function sortTemplatesForCourse<T extends ScopedTemplate>(templates: T[], courseId: string | null | undefined): T[] {
  return templates.slice().sort((a, b) => {
    const aPropre = courseId != null && a.courseId === courseId ? 0 : 1;
    const bPropre = courseId != null && b.courseId === courseId ? 0 : 1;
    return aPropre - bPropre || a.title.localeCompare(b.title, "fr");
  });
}

/**
 * Ce modèle peut-il servir pour cette formation ?
 *
 * Le pendant serveur du filtre : les écrans proposent, celle-ci refuse. Une
 * liste bien filtrée n'est pas une garantie — un identifiant de modèle
 * arrive dans le corps d'une requête, et rien n'oblige un appelant à
 * l'avoir pris dans la liste qu'on lui a montrée.
 */
export function templateAppliesToCourse(
  template: { courseId: string | null },
  courseId: string | null | undefined,
): boolean {
  if (template.courseId == null) return true;
  return template.courseId === courseId;
}

/** Message d'erreur unique, pour que les routes disent toutes la même chose. */
export const TEMPLATE_WRONG_COURSE =
  "Ce modèle est rattaché à une autre formation — il ne peut pas servir pour ce dossier.";
