/**
 * Ce qui manque sur une formation, et surtout CE QUE ÇA BLOQUE.
 *
 * Le parti pris tient en une phrase : on ne rend rien obligatoire à la
 * création. Un champ obligatoire empêche d'enregistrer une formation un
 * vendredi soir parce qu'on n'a pas encore décidé du prix ; il ne fait pas
 * remplir le champ, il fait renoncer.
 *
 * À la place, on affiche ce qui manque en le rattachant à sa conséquence
 * réelle. « Prérequis manquant » n'engage personne ; « votre fiche ne peut
 * pas être publiée » se traite. Chaque manque est donc groupé par ce qu'il
 * empêche, jamais par catégorie technique.
 *
 * Module pur : aucune requête, aucun accès à Prisma. Il reçoit ce qu'une
 * formation contient et rend une liste — testable sans base, et réutilisable
 * partout où la question se pose (fiche formation, catalogue, plus tard une
 * tâche du tableau de bord).
 */

/** Ce qu'un manque empêche. L'ordre est celui de l'urgence pour l'organisme. */
export type Blocage = "publication" | "contrat" | "bpf";

export const BLOCAGE_LABELS: Record<Blocage, string> = {
  publication: "la publication de votre fiche",
  contrat: "le contrat et la convention",
  bpf: "votre bilan pédagogique et financier",
};

export type ChampManquant = {
  /** Nom du champ tel qu'il apparaît dans les formulaires. */
  libelle: string;
  /** Ancre de l'onglet/écran où le corriger, relative à la fiche formation. */
  ancre: string;
};

export type GroupeManquant = { blocage: Blocage; champs: ChampManquant[] };

export type CourseCompletenessInput = {
  durationHours: number | null;
  priceCents: number | null;
  prerequisites: string | null;
  accessModalities: string | null;
  accessDelay: string | null;
  teachingMethods: string | null;
  evaluationModalities: string | null;
};

const vide = (v: string | null) => v == null || v.trim() === "";

/**
 * Les manques d'une formation, groupés par conséquence.
 *
 * Les cinq champs « publication » sont ceux de l'indicateur 1 du RNQ que la
 * description libre ne porte pas de façon fiable — c'est l'absence de
 * prérequis qui a valu au pilote sa non-conformité 2022. Ils ne bloquent pas
 * techniquement la publication : ils la rendent non conforme, ce qui revient
 * au même le jour de l'audit.
 *
 * Un groupe sans manque n'est pas rendu : une liste qui affiche « rien à
 * faire ici » à côté de ce qu'il y a à faire dilue ce qu'il y a à faire.
 */
export function coursMisses(c: CourseCompletenessInput): GroupeManquant[] {
  const groupes: GroupeManquant[] = [];

  const publication: ChampManquant[] = [];
  if (vide(c.prerequisites)) publication.push({ libelle: "prérequis", ancre: "?tab=resume#prerequisites" });
  if (vide(c.accessModalities)) publication.push({ libelle: "modalités d'accès", ancre: "?tab=resume#accessModalities" });
  if (vide(c.accessDelay)) publication.push({ libelle: "délai d'accès", ancre: "?tab=resume#accessDelay" });
  if (vide(c.teachingMethods)) publication.push({ libelle: "méthodes mobilisées", ancre: "?tab=resume#teachingMethods" });
  if (vide(c.evaluationModalities))
    publication.push({ libelle: "modalités d'évaluation", ancre: "?tab=resume#evaluationModalities" });
  if (publication.length > 0) groupes.push({ blocage: "publication", champs: publication });

  // Le prix d'abord : c'est le seul manque qui produit un DOCUMENT faux
  // plutôt qu'un document absent — une convention part avec un montant vide.
  if (c.priceCents == null) {
    groupes.push({ blocage: "contrat", champs: [{ libelle: "prix de la formation", ancre: "?tab=resume#priceCents" }] });
  }

  if (c.durationHours == null) {
    groupes.push({ blocage: "bpf", champs: [{ libelle: "durée en heures", ancre: "?tab=resume#durationHours" }] });
  }

  return groupes;
}

/** Le total, pour le titre du bandeau. */
export function compterManques(groupes: GroupeManquant[]): number {
  return groupes.reduce((n, g) => n + g.champs.length, 0);
}
