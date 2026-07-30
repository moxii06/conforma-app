// Shared between the library page (server) and its client forms — mirrors
// the dossier journey checklist steps (needs assessment, convention,
// convocation, eval hot/cold) plus the two standalone org-level documents
// requested alongside them (CGV, règlement intérieur).
export const DOCUMENT_CATEGORIES = [
  "needs_assessment",
  "convention",
  "contrat_formation",
  "convocation",
  "eval_hot",
  "eval_cold",
  "cgv",
  "internal_rules",
  "welcome_booklet",
  "attendance_sheet",
  "interim_report",
  "final_report",
  "results_summary",
  "subcontractor_contract",
  "handicap_partners",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  needs_assessment: "Recueil des besoins",
  convention: "Convention de formation",
  contrat_formation: "Contrat de formation (particulier)",
  convocation: "Convocation",
  eval_hot: "Évaluation à chaud",
  eval_cold: "Évaluation à froid",
  cgv: "Conditions générales de vente",
  internal_rules: "Règlement intérieur",
  welcome_booklet: "Livret d'accueil",
  attendance_sheet: "Feuille d'émargement",
  interim_report: "Bilan intermédiaire",
  final_report: "Bilan final",
  results_summary: "Relevé de résultats",
  subcontractor_contract: "Contrat sous-traitant / intervenant",
  handicap_partners: "Répertoire partenaires handicap",
  other: "Autre",
  cv: "CV",
  diploma: "Diplôme",
  nda: "NDA / confidentialité",
  rnq_engagement: "Engagement de conformité RNQ",
};

// Client feedback: a row titled "Convention de formation professionnelle"
// next to a pill reading "Convention de formation" says the same thing
// twice. The pill only earns its place when it adds information the title
// doesn't carry — i.e. when at least one significant word of the category
// label is absent from the title. Stopwords don't count as signal.
const LABEL_STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "à", "d", "l"]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !LABEL_STOPWORDS.has(w));
}

export function categoryLabelIsRedundant(title: string, category: string): boolean {
  const label = CATEGORY_LABELS[category];
  if (!label) return false;
  const titleWords = new Set(significantWords(title));
  const labelWords = significantWords(label);
  return labelWords.length > 0 && labelWords.every((w) => titleWords.has(w));
}

// Kept separate from DOCUMENT_CATEGORIES — client feedback: a formateur's
// tracked documents are contrat/CV/diplômes/NDA specifically, a narrower
// and different set than the dossier/library document categories above
// (which would be noise in this picker, and vice versa). rnq_engagement
// (Qualiopi indicator 27 — sous-traitance conforme au référentiel) is
// tracked the same way: a signed attestation the OF collects from the
// subcontractor, not something Jalon can generate on their behalf.
export const SUBCONTRACTOR_DOCUMENT_CATEGORIES = ["subcontractor_contract", "cv", "diploma", "nda", "rnq_engagement", "other"] as const;

// A team member (internal staff) doesn't have a contrat sous-traitant or
// NDA to track — just the same CV/diplôme kind of paperwork, narrower still.
export const MEMBER_DOCUMENT_CATEGORIES = ["cv", "diploma", "other"] as const;
