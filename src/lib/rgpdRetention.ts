import { addDays, addMonths, addWeeks, addYears } from "date-fns";

/**
 * Durées de conservation : lire le registre article 30 sans rien inventer.
 *
 * Le registre reste au niveau de l'ORGANISME — huit à quinze lignes, une
 * par traitement. Le dupliquer par apprenant l'exploserait (4 000
 * apprenants × 10 traitements = 40 000 lignes à tenir à jour à la main),
 * et surtout il cesserait d'être le document que la CNIL demande. L'écran
 * « Suivi par apprenant » est donc un CALCUL, jamais une table : registre
 * × dossiers, recroisés à l'affichage.
 *
 * Ce fichier porte les trois règles de ce croisement, à un seul endroit
 * parce qu'elles sont juridiques et non cosmétiques :
 *
 *   1. quel traitement concerne un apprenant (art. 30(1)(c)) ;
 *   2. quelle date fait courir la conservation ;
 *   3. combien de temps dure cette conservation.
 *
 * La troisième est la seule vraiment piégeuse. `ProcessingActivity
 * .retentionPeriod` est du texte libre, saisi par l'organisme : « 5 ans
 * après la fin de la formation », « 10 ans (article L. 123-22 du code de
 * commerce) », « Durée de la formation, puis suppression ». On en tire une
 * date quand la phrase en désigne UNE sans ambiguïté, et rien du tout
 * sinon. Une échéance fausse mais affichée avec aplomb est pire qu'une
 * absence d'échéance : elle fait supprimer trop tôt, ou dormir trop
 * longtemps sur des données qui auraient dû partir. Même discipline que
 * les parseurs du BPF, qui rendent `null` plutôt qu'une supposition.
 */

/** Trois mois avant l'échéance : le moment où il faut préparer le sort des données. */
export const MOIS_ECHEANCE_PROCHE = 3;

export type UniteDuree = "jour" | "semaine" | "mois" | "an";
export type DureeConservation = { nombre: number; unite: UniteDuree };

// Pour comparer deux durées entre elles seulement — jamais pour calculer
// une échéance, qui passe par le calendrier réel (addYears & co.).
const JOURS_PAR_UNITE: Record<UniteDuree, number> = { jour: 1, semaine: 7, mois: 30, an: 365 };

const NOMBRES_EN_LETTRES: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
};

// « 5 ans », « 6 mois », « un an », « 30 jours », « 2 semaines ».
// Le `\b` de tête n'est pas décoratif : sans lui, « aucune conservation
// au-delà d'un an » ferait matcher le « un » de « aucun ».
const MOTIF_DUREE = /\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s*(ans?|annees?|mois|jours?|semaines?)\b/g;

/** Minuscules sans accents : « Durée », « années » et « ANS » doivent se lire pareil. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function uniteDe(mot: string): UniteDuree {
  if (mot.startsWith("mois")) return "mois";
  if (mot.startsWith("jour")) return "jour";
  if (mot.startsWith("semaine")) return "semaine";
  return "an"; // an, ans, annee, annees
}

/**
 * La durée exprimée par une mention de conservation, ou `null`.
 *
 * `null` dans trois cas, tous volontaires :
 *
 *   — aucun nombre de durée (« Durée de la formation, puis suppression ») :
 *     la phrase ne désigne pas un délai, elle désigne un événement ;
 *   — deux durées DIFFÉRENTES (« 5 ans, porté à 10 ans en cas de financement
 *     public ») : laquelle s'applique dépend d'un fait que cet écran ne
 *     connaît pas. Prendre la première serait un choix arbitraire, prendre
 *     la plus longue reviendrait à décider à la place de l'organisme ;
 *   — texte vide.
 *
 * Deux mentions IDENTIQUES (« 6 mois, prolongeable de 6 mois ») ne sont pas
 * une ambiguïté : les deux disent la même durée.
 */
export function analyserDureeConservation(texte: string | null | undefined): DureeConservation | null {
  if (!texte) return null;
  const trouvees: DureeConservation[] = [];
  for (const m of normaliser(texte).matchAll(MOTIF_DUREE)) {
    const brut = m[1];
    const nombre = /^\d+$/.test(brut) ? Number(brut) : NOMBRES_EN_LETTRES[brut];
    if (!nombre || nombre <= 0) continue;
    trouvees.push({ nombre, unite: uniteDe(m[2]) });
  }
  if (trouvees.length === 0) return null;

  const enJours = (d: DureeConservation) => d.nombre * JOURS_PAR_UNITE[d.unite];
  const reference = enJours(trouvees[0]);
  if (trouvees.some((d) => enJours(d) !== reference)) return null;
  return trouvees[0];
}

/**
 * La date à laquelle la conservation prend fin, ou `null` si la mention ne
 * permet pas de la calculer.
 *
 * Approximation assumée et signalée à l'écran : le registre dit souvent
 * « 5 ans APRÈS LA FIN DE LA FORMATION » là où l'on compte à partir de la
 * date d'obtention. L'écart vaut la durée d'une formation, il se voit, et
 * la mention d'origine reste affichée à côté pour qu'il soit arbitrable.
 * L'alternative — un point de départ par traitement — demanderait un champ
 * structuré que le registre n'a pas.
 */
export function echeanceConservation(obtenuLe: Date, retentionPeriod: string | null | undefined): Date | null {
  const duree = analyserDureeConservation(retentionPeriod);
  if (!duree) return null;
  switch (duree.unite) {
    case "jour":
      return addDays(obtenuLe, duree.nombre);
    case "semaine":
      return addWeeks(obtenuLe, duree.nombre);
    case "mois":
      return addMonths(obtenuLe, duree.nombre);
    case "an":
      return addYears(obtenuLe, duree.nombre);
  }
}

export type StatutConservation = "actif" | "proche" | "echu";

export const STATUT_CONSERVATION_LABELS: Record<StatutConservation, string> = {
  actif: "Actif",
  proche: "Échéance proche",
  echu: "Échu — à archiver",
};

/** Recalculé à chaque affichage : aucune colonne « statut » n'est stockée, donc aucune ne peut pourrir. */
export function statutConservation(echeance: Date, maintenant: Date): StatutConservation {
  if (echeance <= maintenant) return "echu";
  if (echeance <= addMonths(maintenant, MOIS_ECHEANCE_PROCHE)) return "proche";
  return "actif";
}

// Article 30(1)(c) : « catégories de personnes concernées ». Champ libre,
// rédigé par l'organisme — d'où une reconnaissance lexicale plutôt qu'un
// enum qui n'existe pas. Les termes couvrent le vocabulaire réel du secteur
// (le code de la formation professionnelle dit « stagiaire », les OF disent
// « apprenant », les financeurs « bénéficiaire »).
const MOTS_APPRENANT = ["stagiaire", "apprenant", "apprenti", "eleve", "participant", "beneficiaire", "toute personne"];

/**
 * Ce traitement concerne-t-il les apprenants ?
 *
 * `false` quand la mention est vide, et c'est délibéré : une ligne de
 * registre sans personnes concernées est une non-conformité article 30, pas
 * un traitement « qui concerne peut-être tout le monde ». L'écran compte ces
 * lignes et le dit, au lieu de les faire disparaître ou de les attribuer à
 * des apprenants sur la foi d'un champ vide.
 */
export function traitementConcerneApprenants(dataSubjects: string | null | undefined): boolean {
  if (!dataSubjects?.trim()) return false;
  const texte = normaliser(dataSubjects);
  return MOTS_APPRENANT.some((mot) => texte.includes(mot));
}

export type SourceObtention = "signature" | "creation";

/**
 * Depuis quand l'organisme détient les données de ce dossier.
 *
 * La signature du contrat d'abord — c'est l'acte qui fonde la base légale
 * et donc la conservation. La plus ANCIENNE quand il y en a plusieurs (un
 * avenant signé deux ans plus tard ne redémarre pas le compteur du dossier
 * initial). À défaut de signature, la création du dossier : les données ont
 * bien été collectées ce jour-là, contrat ou pas.
 */
export function dateObtention(
  signatures: (Date | null | undefined)[],
  creationDossier: Date
): { date: Date; source: SourceObtention } {
  const reelles = signatures.filter((d): d is Date => d instanceof Date);
  if (reelles.length === 0) return { date: creationDossier, source: "creation" };
  const plusAncienne = reelles.reduce((a, b) => (a <= b ? a : b));
  return { date: plusAncienne, source: "signature" };
}
