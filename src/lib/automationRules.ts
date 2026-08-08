// Single source of truth for automation-rule trigger kinds, so the create
// form, the dashboard task integration, and the cron sender all agree on
// the same values/labels without duplicating strings. Mail-merge tag
// machinery ([Prénom]/[Nom]/...) now lives in lib/mergeTags.ts since it's
// shared by every staff email composer, not just automation rules — kept
// re-exported here too so existing imports don't need to change.
export const AUTOMATION_TRIGGER_VALUES = [
  "needs_assessment_incomplete",
  "contract_not_signed",
  "convocation_missing",
  "rolling_duration_expiring",
  "satisfaction_not_collected",
  "session_reminder",
  "certificate_expiring",
  "invoice_overdue",
] as const;

export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  needs_assessment_incomplete: "Recueil des besoins non complété",
  contract_not_signed: "Convention non signée",
  convocation_missing: "Convocation non envoyée avant la session",
  rolling_duration_expiring: "Durée d'accès bientôt expirée (formation en continu)",
  satisfaction_not_collected: "Avis de satisfaction non recueilli",
  session_reminder: "Rappel de session à venir",
  certificate_expiring: "Attestation bientôt expirée (renouvellement)",
  invoice_overdue: "Échéance de paiement en retard",
};

/**
 * Les déclencheurs dont l'email EST le seul effet.
 *
 * Le schéma promet qu'une règle sans email reste utile (« Task-only by
 * default (shows up in the dashboard's "À faire") »). C'est vrai pour cinq
 * déclencheurs : dashboardTasks.ts lit leur règle et en tire une tâche
 * (convocation_missing, needs_assessment_incomplete, contract_not_signed,
 * rolling_duration_expiring, satisfaction_not_collected).
 *
 * Ce n'est pas vrai pour les trois qui suivent. Le cron ne charge que
 * `sendEmail: true` (cron/automation-rules/route.ts), et rien ne les
 * rattrape côté tableau de bord :
 *  - session_reminder : aucun type de tâche ne couvre le rappel de session ;
 *  - certificate_expiring : Document.expiresAt n'est lu que par le cron —
 *    la tâche `qualiopi_certificate_expiring` porte le certificat Qualiopi
 *    DE L'ORGANISME, pas l'attestation d'un apprenant ;
 *  - invoice_overdue : la tâche du même nom existe, mais elle se calcule sur
 *    l'état des factures de tout l'organisme, sans lire ni la règle ni son
 *    `afterDays` — la règle, elle, reste inerte.
 *
 * Une règle sans email sur l'un de ces trois est donc une ligne qui se
 * compte parmi les « règles actives » et ne fait rien. D'où l'email exigé à
 * la création, et la mention « sans effet » sur celles déjà en base.
 *
 * Le jour où l'un d'eux gagne sa tâche dans dashboardTasks.ts, il sort de
 * cette liste — c'est le seul endroit à changer.
 */
export const DECLENCHEURS_EMAIL_OBLIGATOIRE: readonly string[] = [
  "session_reminder",
  "certificate_expiring",
  "invoice_overdue",
];

/** Une règle qui ne produira ni email ni tâche : voir la liste ci-dessus. */
export function regleSansEffet(trigger: string, sendEmail: boolean): boolean {
  return !sendEmail && DECLENCHEURS_EMAIL_OBLIGATOIRE.includes(trigger);
}

/**
 * Comment se lit le délai d'une règle — et surtout À PARTIR DE QUOI il court.
 *
 * Retour client : « ce n'est pas très clair, cela ne dit pas 7 j après
 * quoi ». C'était exact, et pire encore : le point de départ n'est pas le
 * même d'un déclencheur à l'autre, et pour certains le mot « après » était
 * carrément faux — une convocation se relance AVANT la session, pas après.
 *
 * Chaque entrée encadre donc le nombre : un préfixe avant, un suffixe qui
 * nomme le repère après. « Relancer 7 jours après l'inscription », jamais
 * « Relancer après 7 jours ».
 *
 * Ces phrases vivent ici, à côté du déclencheur qu'elles décrivent, et non
 * dans le composant : ajouter un déclencheur sans dire d'où compte son délai
 * doit être impossible à oublier. L'horloge réelle, elle, est dans le cron —
 * ce qui est écrit ici doit en être la traduction fidèle, pas une
 * approximation.
 */
export const AUTOMATION_DELAY_PHRASING: Record<string, { avant: string; apres: string }> = {
  // Comptent depuis Dossier.createdAt, c'est-à-dire l'inscription.
  needs_assessment_incomplete: { avant: "Relancer", apres: "jours après l'inscription" },
  contract_not_signed: { avant: "Relancer", apres: "jours après l'inscription" },
  // Compte depuis session.endsAt.
  satisfaction_not_collected: { avant: "Relancer", apres: "jours après la fin de la session" },
  // Comptent à rebours depuis une échéance.
  convocation_missing: { avant: "Relancer si toujours pas envoyée, à partir de", apres: "jours avant la session" },
  rolling_duration_expiring: { avant: "Prévenir", apres: "jours avant la fin de la durée d'accès" },
  session_reminder: { avant: "Envoyer le rappel", apres: "jours avant la session" },
  certificate_expiring: { avant: "Envoyer le rappel de renouvellement", apres: "jours avant l'expiration de l'attestation" },
  invoice_overdue: { avant: "Relancer", apres: "jours après l'échéance de paiement" },
};

/**
 * La même information en une ligne, pour la liste des règles déjà posées.
 * « Recueil des besoins non complété — 7 j » ne disait pas davantage que le
 * formulaire ; on y lit maintenant le repère.
 */
export function resumerDelaiRegle(trigger: string, afterDays: number): string {
  const p = AUTOMATION_DELAY_PHRASING[trigger];
  if (!p) return `${afterDays} j`;
  return `${afterDays} ${p.apres}`;
}

export { MERGE_TAGS, fillMergeTags, type MergeTagContext } from "@/lib/mergeTags";
