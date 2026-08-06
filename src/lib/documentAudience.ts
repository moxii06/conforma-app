import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/documentCategories";

// À QUI un document est destiné — le client, ou un fournisseur.
//
// Ce n'est pas une commodité de tri : c'est une cloison. Les écrans qui
// écrivent à un apprenant ou à un prospect proposaient les dix-huit
// catégories, dont le contrat de sous-traitance, le contrat de formateur
// indépendant et le contrat de tournage. Offrir ces trois-là dans une boîte
// de dialogue adressée à quelqu'un qui négocie un prix avec vous, c'est
// mettre à un clic l'envoi de vos accords de sous-traitance à votre client.
//
// L'asymétrie du risque commande le sens de la cloison. Un document client
// qui part chez un sous-traitant est gênant ; un document fournisseur qui
// part chez un client révèle vos marges et vos arrangements. Seul le second
// sens est donc ferme ici : les écrans client excluent le fournisseur. Le
// choix de ce qui remonte en tête selon le moment du parcours est une autre
// question, de confort, traitée séparément.

export type Destinataire = "client" | "fournisseur";

// Exhaustif sur le catalogue : une catégorie nouvelle ne compile pas tant
// qu'elle n'a pas été rangée d'un côté ou de l'autre. Le défaut silencieux
// d'une table de correspondance est ce qui, ailleurs, avait envoyé le même
// bilan final à toute une promotion.
export const DESTINATAIRE_PAR_CATEGORIE: Record<DocumentCategory, Destinataire> = {
  needs_assessment: "client",
  convention: "client",
  contrat_formation: "client",
  convocation: "client",
  eval_hot: "client",
  eval_cold: "client",
  cgv: "client",
  internal_rules: "client",
  welcome_booklet: "client",
  attendance_sheet: "client",
  interim_report: "client",
  final_report: "client",
  results_summary: "client",
  subcontractor_contract: "fournisseur",
  trainer_contract: "fournisseur",
  video_shoot_contract: "fournisseur",
  handicap_partners: "client",
  other: "client",
};

/** Les catégories à ne jamais proposer sur un écran qui écrit à un client. */
export const CATEGORIES_FOURNISSEUR: string[] = DOCUMENT_CATEGORIES.filter(
  (c) => DESTINATAIRE_PAR_CATEGORIE[c] === "fournisseur",
);

/**
 * Le destinataire d'une catégorie.
 *
 * Une catégorie hors catalogue est traitée comme cliente, et ce n'est pas
 * un défaut silencieux : les trois catégories fournisseur sont fournies par
 * Jalon et fermées, un organisme ne peut pas en inventer une quatrième. Ce
 * qu'il crée pour son propre usage s'adresse donc à ses clients.
 */
export function destinataireDe(category: string): Destinataire {
  return DESTINATAIRE_PAR_CATEGORIE[category as DocumentCategory] ?? "client";
}

export function estPourClient(category: string): boolean {
  return destinataireDe(category) === "client";
}
