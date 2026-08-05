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
