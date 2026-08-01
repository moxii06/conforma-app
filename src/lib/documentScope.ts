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

// Les catégories qui engagent une personne nommée. Tout le reste est
// commun par défaut : c'est le sens le moins coûteux quand on hésite, un
// document commun de trop se renvoie, un contrat manquant se plaide.
const PER_LEARNER_CATEGORIES = new Set([
  "contrat_formation", // engage le stagiaire lui-même
  "convocation", // porte ses dates et son lieu
  "needs_assessment", // sa situation, ses objectifs
  "eval_hot",
  "eval_cold",
  "results_summary",
  "attendance_certificate",
  "lms_certificate",
]);

export function scopeOfCategory(category: string): DocumentScope {
  return PER_LEARNER_CATEGORIES.has(category) ? "per_learner" : "single";
}

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
