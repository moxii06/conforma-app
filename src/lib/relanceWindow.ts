import { addDays } from "date-fns";

// Fenêtres de temps des relances automatiques.
//
// Extrait de la route de cron pour être testable : c'est la pièce dont une
// erreur ne se voit pas en relisant le code mais s'observe en produisant
// des milliers d'emails partis chez d'anciens apprenants. Le reste du cron
// a besoin d'une base de données pour être exercé ; ces calculs de dates,
// non.
//
// Contexte (audit S7, tenue en charge) : les règles de relance
// sélectionnaient tout dossier dont la case n'est pas cochée, sans borne
// haute d'ancienneté. Pour un organisme qui vient de reprendre son
// historique dans Jalon, ces cases ne sont cochées nulle part — le
// lendemain de l'import, le cron considérait trois ans de dossiers clos
// comme du retard à relancer.

// Ancienneté au-delà de laquelle une relance automatique ne part plus.
//
// Six mois est un choix explicite, pas une évidence : au-delà, relancer
// quelqu'un sur un recueil des besoins, une convention ou une facture n'a
// plus de sens commercial ni pédagogique. Ce n'est PAS un filtre
// d'affichage — la tâche reste dans le « à faire » du tableau de bord,
// seul l'envoi automatique s'arrête.
export const RELANCE_ANCIENNETE_MAX_JOURS = 180;

// Durée d'accès la plus longue qu'on considère plausible pour une
// formation en continu. Sert uniquement à borner en base une requête dont
// le vrai critère (firstAccessedAt + accessDurationDays) n'est pas
// calculable en SQL — ce n'est pas une limite imposée à l'organisme, qui
// reste libre de saisir ce qu'il veut. Deux ans laisse une marge
// confortable sur les durées réellement pratiquées (6 à 12 mois).
export const DUREE_ACCES_MAX_JOURS = 730;

// Nombre d'enquêtes de satisfaction à chaud envoyées par passage et par
// questionnaire. C'est la toute première étape du cron : si elle déborde,
// rien de ce qui suit (règles de relance, échéanciers, synchronisation des
// boîtes mail, résumés quotidiens) ne s'exécute — et comme le passage du
// lendemain repart à l'identique, la panne est définitive et silencieuse.
// Mieux vaut avancer par lots que tout bloquer.
export const MAX_ENQUETES_PAR_PASSAGE = 50;

export function plancherAnciennete(maintenant = new Date()): Date {
  return addDays(maintenant, -RELANCE_ANCIENNETE_MAX_JOURS);
}

// Fenêtre fermée aux deux bouts pour une règle donnée : assez ancien pour
// mériter une relance (`lte`), pas assez pour qu'elle soit absurde
// (`gte`). Se branche tel quel dans un `where` Prisma sur une colonne de
// date.
export function fenetreRelance(afterDays: number, maintenant = new Date()): { lte: Date; gte: Date } {
  return { lte: addDays(maintenant, -afterDays), gte: plancherAnciennete(maintenant) };
}

// Borne basse pour les relances de fin d'accès en continu : au-delà,
// l'échéance est forcément dépassée depuis longtemps.
export function plancherPremierAcces(afterDays: number, maintenant = new Date()): Date {
  return addDays(maintenant, -(DUREE_ACCES_MAX_JOURS + afterDays));
}
