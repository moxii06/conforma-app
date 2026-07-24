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
] as const;

export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  needs_assessment_incomplete: "Recueil des besoins non complété",
  contract_not_signed: "Convention non signée",
  convocation_missing: "Convocation non envoyée avant la session",
  rolling_duration_expiring: "Durée d'accès bientôt expirée (formation en continu)",
  satisfaction_not_collected: "Avis de satisfaction non recueilli",
};

export { MERGE_TAGS, fillMergeTags, type MergeTagContext } from "@/lib/mergeTags";
