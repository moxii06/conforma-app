/**
 * Les tâches du tableau de bord qui se traitent en un appel.
 *
 * Extrait de DashboardTaskAction pour être partagé avec l'envoi en lot :
 * les deux doivent viser exactement les mêmes routes avec exactement les
 * mêmes corps de requête. Deux copies auraient divergé au premier ajout.
 *
 * Ne figurent ici que les tâches dont l'`id` EST un dossierId et pour
 * lesquelles une route existe déjà. Rien n'est inventé côté serveur — et
 * c'est aussi pourquoi l'envoi en lot rejoue ces mêmes appels un par un
 * plutôt que de refaire, côté serveur, les 194 lignes de la route d'envoi :
 * une seconde implémentation aurait fini par ne plus dire la même chose.
 */
export type TaskActionDef = {
  /** Libellé du bouton, pour une seule tâche. */
  label: string;
  /** Libellé du bouton de lot, sans le nombre (l'appelant l'ajoute). */
  labelLot: string;
  /** Verbe à l'infinitif pour les phrases de confirmation du lot. */
  actionLot: string;
  endpoint: (id: string) => string;
  body?: unknown;
  confirmer: (nom: string) => string;
};

export const TASK_ACTIONS: Record<string, TaskActionDef> = {
  convocation: {
    label: "Envoyer la convocation",
    labelLot: "Envoyer les convocations",
    actionLot: "envoyer leur convocation",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "convocation" },
    confirmer: (nom) => `Envoyer la convocation à ${nom} maintenant ?`,
  },
  dossier_prep_contract: {
    label: "Envoyer la convention",
    labelLot: "Envoyer les conventions",
    actionLot: "envoyer leur convention",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "contract" },
    confirmer: (nom) => `Générer et envoyer la convention à ${nom} maintenant ?`,
  },
  platform_access_after_payment: {
    label: "Envoyer les accès",
    labelLot: "Envoyer les accès",
    actionLot: "envoyer leurs accès à la plateforme",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "platform_access" },
    confirmer: (nom) => `Envoyer ses accès à la plateforme à ${nom} maintenant ?`,
  },
  dossier_prep_needs_assessment: {
    label: "Envoyer le recueil",
    labelLot: "Envoyer les recueils",
    actionLot: "envoyer leur recueil des besoins",
    endpoint: (id) => `/api/dossiers/${id}/send-needs-assessment`,
    confirmer: (nom) => `Envoyer le recueil des besoins à ${nom} maintenant ?`,
  },
  satisfaction_not_collected: {
    label: "Envoyer l'évaluation",
    labelLot: "Envoyer les évaluations",
    actionLot: "envoyer leur questionnaire de satisfaction",
    endpoint: (id) => `/api/dossiers/${id}/satisfaction-surveys/cold/send`,
    confirmer: (nom) => `Envoyer le questionnaire de satisfaction à ${nom} maintenant ?`,
  },
  certificate_to_send: {
    label: "Envoyer l'attestation",
    labelLot: "Envoyer les attestations",
    actionLot: "envoyer leur attestation de formation",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "certificate" },
    confirmer: (nom) => `Délivrer et envoyer son attestation à ${nom} maintenant ?`,
  },
  // Les trois familles ci-dessous partagent la même relance : l'apprenant a
  // décroché, ou son échéance approche, ou elle est passée. Le message est
  // le même — « reprenez votre parcours » — et il n'y a aucune raison d'en
  // écrire trois. Ce qui les distingue, c'est le moment où Jalon les
  // remonte, pas ce qu'on leur dit.
  learner_inactive: {
    label: "Relancer l'apprenant",
    labelLot: "Relancer les apprenants",
    actionLot: "les relancer",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "learner_nudge" },
    confirmer: (nom) => `Envoyer une relance à ${nom} maintenant ?`,
  },
  rolling_deadline_warning: {
    label: "Relancer l'apprenant",
    labelLot: "Relancer les apprenants",
    actionLot: "les relancer avant l'échéance",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "learner_nudge" },
    confirmer: (nom) => `Envoyer une relance à ${nom} maintenant ?`,
  },
  rolling_deadline_overdue: {
    label: "Relancer l'apprenant",
    labelLot: "Relancer les apprenants",
    actionLot: "les relancer",
    endpoint: (id) => `/api/dossiers/${id}/outreach`,
    body: { type: "learner_nudge" },
    confirmer: (nom) => `Envoyer une relance à ${nom} maintenant ?`,
  },
};

/**
 * Plafond d'un envoi groupé.
 *
 * Ce n'est pas une limite technique mais un garde-fou : chaque destinataire
 * reçoit un vrai email, et rien ne le rattrape. Cinquante d'un coup est
 * déjà beaucoup pour une action lancée depuis un tableau de bord ; au-delà,
 * mieux vaut y revenir que découvrir après coup qu'on a écrit à trois cents
 * personnes. Le dialogue le dit explicitement plutôt que de tronquer en
 * silence.
 */
export const MAX_ENVOIS_PAR_LOT = 50;

/** Concurrence des envois d'un lot. */
export const CONCURRENCE_LOT = 4;
