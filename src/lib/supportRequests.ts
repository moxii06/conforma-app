/**
 * Le vocabulaire partagé des demandes d'aide : réclamations (Complaint) et
 * signalements confidentiels (SecureReport).
 *
 * Fichier volontairement PUR — aucun import de Prisma, aucun composant — pour
 * qu'il soit lisible aussi bien par la page serveur que par les formulaires
 * client. Les libellés d'urgence et de statut étaient jusqu'ici écrits dans la
 * page ; dès que le formulaire d'assignation a eu besoin des mêmes mots, les
 * recopier garantissait qu'ils finiraient par diverger (« Urgent » d'un côté,
 * « Prioritaire » de l'autre, pour la même valeur en base).
 */

/** Les deux familles de demandes, telles qu'elles s'écrivent dans les URL d'API. */
export type SupportKind = "complaints" | "secure-reports";

export const SUPPORT_KIND_LABELS: Record<SupportKind, string> = {
  "complaints": "Réclamation",
  "secure-reports": "Signalement confidentiel",
};

/* ------------------------------------------------------------------ *
 * URGENCE
 * ------------------------------------------------------------------ */

export const SUPPORT_URGENCIES = ["urgent", "soon", "info"] as const;
export type SupportUrgency = (typeof SUPPORT_URGENCIES)[number];

export const URGENCY_LABELS: Record<SupportUrgency, string> = {
  urgent: "Urgent",
  soon: "À faire sous peu",
  info: "Pour information",
};

/**
 * Ce que l'urgence dit DE PLUS que l'échéance.
 *
 * Les deux champs coexistent et ne se remplacent pas : l'échéance dit « pour
 * quand », l'urgence dit « à quel point ça passe devant le reste ». Une
 * demande peut être urgente sans échéance (on ne sait pas encore combien de
 * temps il faudra) et avoir une échéance sans être urgente (une obligation
 * annuelle). Sans cette phrase à l'écran, les deux contrôles côte à côte se
 * lisent comme une redite.
 */
export const URGENCY_HINTS: Record<SupportUrgency, string> = {
  urgent: "passe devant le reste du travail en cours",
  soon: "à traiter dans les prochains jours",
  info: "à connaître, sans action immédiate attendue",
};

/**
 * Ton de la pastille — les tons de `Pill` (components/ui.tsx), jamais une
 * couleur en dur : « danger » est le rust, « warn » le laiton (seal),
 * « neutral » le gris.
 */
export const URGENCY_TONE: Record<SupportUrgency, "danger" | "warn" | "neutral"> = {
  urgent: "danger",
  soon: "warn",
  info: "neutral",
};

/**
 * `urgency` est une colonne texte libre côté base (pas une enum Postgres) :
 * une valeur inconnue — une reprise de données, un ancien enregistrement —
 * doit retomber sur le défaut plutôt que casser l'affichage.
 */
export function normaliserUrgence(valeur: string | null | undefined): SupportUrgency {
  return (SUPPORT_URGENCIES as readonly string[]).includes(valeur ?? "") ? (valeur as SupportUrgency) : "soon";
}

/* ------------------------------------------------------------------ *
 * STATUTS
 * ------------------------------------------------------------------ */

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  open: "Ouverte",
  investigating: "En cours d'examen",
  resolved: "Résolue",
};

export const COMPLAINT_STATUS_TONE: Record<string, "danger" | "warn" | "good"> = {
  open: "danger",
  investigating: "warn",
  resolved: "good",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  received: "Reçu",
  under_review: "En cours d'examen",
  escalated: "Escaladé",
  closed: "Clos",
};

export const REPORT_STATUS_TONE: Record<string, "danger" | "warn" | "good" | "neutral"> = {
  received: "danger",
  under_review: "warn",
  escalated: "danger",
  closed: "neutral",
};

/** Le statut terminal de chaque famille — celui qui vaut « c'est traité ». */
export const STATUT_TRAITE: Record<SupportKind, string> = {
  "complaints": "resolved",
  "secure-reports": "closed",
};

export function estTraite(kind: SupportKind, status: string): boolean {
  return status === STATUT_TRAITE[kind];
}

export function libelleStatut(kind: SupportKind, status: string): string {
  const table = kind === "complaints" ? COMPLAINT_STATUS_LABELS : REPORT_STATUS_LABELS;
  return table[status] ?? status;
}

export function tonStatut(kind: SupportKind, status: string): "danger" | "warn" | "good" | "neutral" {
  const table = kind === "complaints" ? COMPLAINT_STATUS_TONE : REPORT_STATUS_TONE;
  return table[status] ?? "warn";
}
