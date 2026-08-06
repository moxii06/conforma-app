// Un document par apprenant, ou un seul document pour tout le monde ?
//
// La réponse se déduit du TYPE, jamais d'une case à cocher : un contrat
// engage une personne nommée et se signe individuellement, un règlement
// intérieur est le même pour tout le monde. Demander à chaque création
// serait une question de plus dont la réponse est déjà connue — et une
// occasion de se tromper sur un document contractuel.
//
// L'erreur coûte cher dans les deux sens. Générer un contrat unique pour
// huit stagiaires produit une pièce inopposable et une signature
// électronique impossible ; générer huit règlements intérieurs identiques
// noie la bibliothèque et fait payer huit signatures au lieu de zéro.

export type DocumentScope = "per_learner" | "single";

// La portée de CHAQUE catégorie du catalogue, écrite une par une.
//
// La version précédente listait les catégories « par apprenant » et laissait
// tout le reste tomber sur « unique » par défaut. Ce silence a coûté deux
// erreurs : le bilan intermédiaire et le bilan final — qui portent
// l'assiduité, les résultats et l'évaluation des acquis d'UNE personne —
// partaient en un seul exemplaire identique pour toute la promotion. Une
// table exhaustive oblige à trancher pour toute nouvelle catégorie, et le
// test vérifie qu'aucune n'a été oubliée.
const SCOPE_PAR_CATEGORIE: Record<string, DocumentScope> = {
  // — Ce qui engage ou décrit une personne nommée —
  contrat_formation: "per_learner", // engage le stagiaire lui-même (L.6353-3)
  convocation: "per_learner", // porte ses dates et son lieu
  needs_assessment: "per_learner", // sa situation, ses objectifs
  eval_hot: "per_learner", // son ressenti
  eval_cold: "per_learner", // sa mise en pratique
  results_summary: "per_learner", // ses résultats — et l'attestation qui en découle
  interim_report: "per_learner", // sa progression à mi-parcours
  final_report: "per_learner", // son assiduité, ses acquis, sa note

  // — Ce qui est commun à toute une session ou à tout l'organisme —
  convention: "single", // lie l'organisme à l'ENTREPRISE acheteuse (L.6353-2)
  cgv: "single",
  internal_rules: "single",
  welcome_booklet: "single",
  attendance_sheet: "single", // une feuille par journée, tout le monde y signe
  handicap_partners: "single",
  other: "single",

  // — Ce qui engage un intervenant, pas un apprenant —
  //
  // « Unique » au sens de la génération : le document se produit en un
  // exemplaire pour le sous-traitant visé. Le multiplier par apprenant
  // n'aurait aucun sens.
  subcontractor_contract: "single",
  trainer_contract: "single",
  video_shoot_contract: "single",
};

/**
 * La portée d'une catégorie, « unique » pour tout ce qui n'est pas au
 * catalogue.
 *
 * Les catégories hors catalogue sont les pièces déposées au dossier d'un
 * intervenant (CV, diplôme, NDA, engagement RNQ) : des fichiers téléversés
 * qui ne se génèrent pas, et pour lesquels « unique » est la seule réponse
 * qui ait un sens.
 */
export function scopeOfCategory(category: string): DocumentScope {
  return SCOPE_PAR_CATEGORIE[category] ?? "single";
}

/** Exposé pour le test d'exhaustivité — rien d'autre ne devrait le lire. */
export const CATEGORIES_AVEC_PORTEE = Object.keys(SCOPE_PAR_CATEGORIE);

export function scopeLabel(scope: DocumentScope): string {
  return scope === "per_learner" ? "Un par apprenant" : "Document unique";
}

export function scopeHint(scope: DocumentScope, learnerCount: number): string {
  if (scope === "single") {
    return "Un seul document, commun à tous les destinataires.";
  }
  if (learnerCount === 0) {
    return "Un document par apprenant sera produit, chacun signable séparément. Choisissez une formation pour savoir combien.";
  }
  return `${learnerCount} document${learnerCount > 1 ? "s" : ""} sera${learnerCount > 1 ? "ont" : ""} produit${
    learnerCount > 1 ? "s" : ""
  }, un par apprenant, chacun signable séparément.`;
}

/**
 * Les balises encore visibles dans un texte prêt à partir.
 *
 * Un document qui part avec « [Nom apprenant] » en toutes lettres est un
 * document raté chez un client — et sur un contrat, une pièce dont la
 * partie n'est pas identifiée. On préfère prévenir avant l'envoi plutôt
 * que de le découvrir dans la réponse du destinataire.
 *
 * Sur un document par apprenant, les balises de la personne SONT censées
 * rester dans le brouillon : elles se résolvent à la génération, une fois
 * par destinataire. Elles ne comptent donc pas comme un oubli.
 */
// La syntaxe de fusion de Jalon est {{clé}} — voir mergeTemplate.ts. Une
// première version de ce fichier cherchait des [Balises] entre crochets :
// elle ne trouvait jamais rien, et annonçait donc « aucune balise
// manquante » sur un document qui en était plein.
const ANY_TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const LEARNER_PREFIX = "contact.";

export function unresolvedTags(bodyText: string, scope: DocumentScope): string[] {
  const trouvés = [...bodyText.matchAll(ANY_TOKEN)].map((m) => m[1]);
  // Sur un document par apprenant, les champs du stagiaire SONT censés
  // rester : ils se résolvent à la génération, une fois par destinataire.
  const retenus = scope === "per_learner" ? trouvés.filter((k) => !k.startsWith(LEARNER_PREFIX)) : trouvés;
  return [...new Set(retenus)];
}
