import { type DocumentCategory } from "@/lib/documentCategories";

// À QUEL MOMENT du parcours un document a un sens.
//
// À ne pas confondre avec le destinataire (lib/documentAudience.ts), qui
// est une cloison : un document fournisseur ne doit jamais atteindre un
// client, point. Ici il ne s'agit que de pertinence, et la conséquence
// n'est donc pas la même — on trie et on replie, on ne masque jamais pour
// de bon. Un organisme peut légitimement envoyer un livret d'accueil à un
// prospect chaud pour le rassurer ; lui interdire le mettrait en lutte
// avec son propre outil. Trier ne lui coûte rien, masquer lui coûterait ça.
//
// Le filtre ne mord donc que là où l'écart est flagrant : la fiche
// prospect, où bilan intermédiaire, relevé de résultats, feuille
// d'émargement et évaluations supposent tous quelqu'un d'inscrit. Sur un
// dossier apprenant, tout reste proposé : l'apprenant est inscrit, chaque
// moment finira par arriver.

export type MomentParcours = "avant_vente" | "inscription" | "pendant" | "apres" | "toujours";

export const MOMENT_PAR_CATEGORIE: Record<DocumentCategory, MomentParcours> = {
  // Avant la vente — ce qui aide à décider.
  needs_assessment: "avant_vente",
  cgv: "avant_vente",
  handicap_partners: "avant_vente",

  // À l'inscription — ce qui engage et ce qui accueille. Un prospect les
  // reçoit forcément : c'est par eux qu'il cesse d'être un prospect.
  contrat_formation: "inscription",
  convention: "inscription",
  internal_rules: "inscription",
  welcome_booklet: "inscription",
  convocation: "inscription",

  // Pendant — suppose une session en cours.
  attendance_sheet: "pendant",
  interim_report: "pendant",

  // Après — suppose une formation terminée.
  eval_hot: "apres",
  eval_cold: "apres",
  final_report: "apres",
  results_summary: "apres",

  // Les documents fournisseur n'atteignent plus les écrans client (voir
  // documentAudience.ts) ; leur moment n'a donc pas d'effet ici, mais la
  // table reste exhaustive pour qu'une catégorie nouvelle ne compile pas
  // tant qu'elle n'a pas été située.
  subcontractor_contract: "toujours",
  trainer_contract: "toujours",
  video_shoot_contract: "toujours",

  // Un modèle « Autre » est celui que l'organisme a créé pour un besoin
  // que le catalogue ne couvre pas. Rien ne permet de le situer, et le
  // reléguer serait cacher à quelqu'un ce qu'il a lui-même écrit.
  other: "toujours",
};

const PERTINENTS_PROSPECT: MomentParcours[] = ["avant_vente", "inscription", "toujours"];

/**
 * Ce document a-t-il un sens pour quelqu'un qui n'est pas encore inscrit ?
 *
 * Une catégorie hors catalogue est pertinente : elle vient de l'organisme,
 * qui sait mieux que cette table à quoi elle sert.
 */
export function estPertinentPourProspect(category: string): boolean {
  const moment = MOMENT_PAR_CATEGORIE[category as DocumentCategory];
  return moment === undefined || PERTINENTS_PROSPECT.includes(moment);
}
