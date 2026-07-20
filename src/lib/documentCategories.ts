// Shared between the library page (server) and its client forms — mirrors
// the dossier journey checklist steps (needs assessment, convention,
// convocation, eval hot/cold) plus the two standalone org-level documents
// requested alongside them (CGV, règlement intérieur).
export const DOCUMENT_CATEGORIES = [
  "needs_assessment",
  "convention",
  "convocation",
  "eval_hot",
  "eval_cold",
  "cgv",
  "internal_rules",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  needs_assessment: "Recueil des besoins",
  convention: "Convention de formation",
  convocation: "Convocation",
  eval_hot: "Évaluation à chaud",
  eval_cold: "Évaluation à froid",
  cgv: "Conditions générales de vente",
  internal_rules: "Règlement intérieur",
  other: "Autre",
};
